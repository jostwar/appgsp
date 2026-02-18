/**
 * Lambda fom-cartera — Consulta de cartera (API real CXC/Fomplus)
 * Compatible con el body que envía el backend: { data: { action, customer_id }, tool_name: "cartera" }
 *
 * En AWS: crear función Node 18+; subir este archivo como index.mjs O usar index.js con "type": "module" en package.json.
 *
 * Variables de entorno en la Lambda:
 *   CXC_API_URL   — Base URL del servicio (sin /EstadoDeCuentaCartera al final)
 *   CXC_TOKEN    — Token (strPar_Token)
 *   CXC_EMPRESA  — Empresa/base (strPar_Basedatos)
 */

function resp(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type,x-api-key",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

function parseEvent(event) {
  try {
    let payload = {};
    if (event?.body) {
      payload = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    } else {
      payload = event;
    }
    return payload.data && typeof payload.data === "object" ? payload.data : payload;
  } catch {
    return null;
  }
}

function parseNum(value) {
  if (typeof value === "number") return value;
  const raw = String(value || "").replace(/[^\d.-]/g, "");
  if (!raw) return 0;
  const n = Number.parseFloat(raw);
  return Number.isNaN(n) ? 0 : n;
}

const SALDO_KEYS = ["saldo", "saldototal", "total", "total_cartera", "SALDO"];
const POR_VENCER_KEYS = ["por_vencer", "porvencer", "saldo_por_vencer"];
const VENCIDO_KEYS = ["vencido", "saldo_vencido", "vencido_total"];
const CUPO_KEYS = ["cupo", "cupo_credito", "cli_cupcre", "limite_credito"];
const DIAS_KEYS = ["daiaven", "diasvenc", "dias_venc", "dias_vencimiento", "DAIAVEN"];

function findVal(obj, keys) {
  if (!obj || typeof obj !== "object") return "";
  const lower = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const targets = new Set(keys.map(lower));
  for (const [k, v] of Object.entries(obj)) {
    if (targets.has(lower(k)) && v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function getItems(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (typeof payload === "string") {
    const t = payload.trim();
    if (t.startsWith("[")) {
      try {
        const arr = JSON.parse(t);
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    }
    if (t.startsWith("{")) {
      try {
        return getItems(JSON.parse(t));
      } catch {
        return [];
      }
    }
    return [];
  }
  if (typeof payload === "object") {
    const wrap = ["table", "data", "result", "rows", "items", "documentos", "table"];
    for (const [k, v] of Object.entries(payload)) {
      if (Array.isArray(v) && v.length > 0 && wrap.includes(String(k).toLowerCase())) return v;
    }
    for (const v of Object.values(payload)) {
      if (Array.isArray(v) && v.length > 0) return v;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const nested = getItems(v);
        if (nested.length > 0) return nested;
      }
    }
  }
  return [];
}

function totalsFromItems(items) {
  let saldo = 0, porVencer = 0, vencido = 0, cupo = 0;
  for (const item of items) {
    const pv = parseNum(findVal(item, POR_VENCER_KEYS));
    const vn = parseNum(findVal(item, VENCIDO_KEYS));
    if (pv > 0 || vn > 0) {
      porVencer += Math.max(0, pv);
      vencido += Math.max(0, vn);
      saldo += Math.max(0, pv) + Math.max(0, vn);
    } else {
      const s = parseNum(findVal(item, SALDO_KEYS) || item?.SALDO);
      const diasRaw = findVal(item, DIAS_KEYS) || item?.DAIAVEN;
      const dias = Number(diasRaw || 0);
      saldo += s;
      if (dias > 0) vencido += s;
      else porVencer += s;
    }
    const c = parseNum(findVal(item, CUPO_KEYS));
    if (c > 0) cupo = c;
  }
  return { saldo, porVencer, vencido, cupo };
}

/** Llama a la API CXC EstadoDeCuentaCartera (mismo contrato que el backend Node) */
async function fetchCarteraFromCxc(customer_id) {
  const baseUrl = (process.env.CXC_API_URL || "").replace(/\/$/, "");
  if (!baseUrl) throw new Error("CXC_API_URL no configurada en Lambda");
  const token = process.env.CXC_TOKEN || "";
  const empresa = process.env.CXC_EMPRESA || "";
  if (!token) throw new Error("CXC_TOKEN no configurado en Lambda");
  if (!empresa) throw new Error("CXC_EMPRESA no configurada en Lambda");

  const fecha = new Date().toISOString().slice(0, 10);
  const url = `${baseUrl}/EstadoDeCuentaCartera`;
  const params = new URLSearchParams({
    strPar_Basedatos: empresa,
    strPar_Token: token,
    datPar_Fecha: fecha,
    strPar_Cedula: String(customer_id),
    strPar_Vended: "",
  });
  const fullUrl = `${url}?${params.toString()}`;

  const res = await fetch(fullUrl, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) throw new Error(`CXC API: ${res.status} ${res.statusText}`);
  const raw = await res.text();
  let data = raw;
  const trimmed = (raw || "").trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
  }
  return data;
}

export async function handler(event) {
  const method = event?.requestContext?.http?.method || event?.httpMethod || "POST";

  if (method === "OPTIONS") {
    return resp(200, { ok: true });
  }

  const data = parseEvent(event);
  if (!data) {
    return resp(400, { ok: false, message: "Body JSON inválido" });
  }

  const action = (data.action || "status").toLowerCase();
  const customer_id = data.customer_id;

  if (!customer_id) {
    return resp(400, { ok: false, message: "Falta customer_id" });
  }

  if (action !== "status") {
    return resp(400, { ok: false, message: "Falta action (status)" });
  }

  try {
    const apiPayload = await fetchCarteraFromCxc(customer_id);
    const items = getItems(apiPayload);

    let saldo = 0, saldo_por_vencer = 0, saldo_vencido = 0, cupo = 0;

    if (items.length > 0) {
      const t = totalsFromItems(items);
      saldo = t.saldo;
      saldo_por_vencer = t.porVencer;
      saldo_vencido = t.vencido;
      cupo = t.cupo;
    }

    if (saldo === 0 && saldo_por_vencer === 0 && saldo_vencido === 0 && typeof apiPayload === "object") {
      saldo = parseNum(findVal(apiPayload, SALDO_KEYS));
      saldo_por_vencer = parseNum(findVal(apiPayload, POR_VENCER_KEYS));
      saldo_vencido = parseNum(findVal(apiPayload, VENCIDO_KEYS));
      cupo = parseNum(findVal(apiPayload, CUPO_KEYS));
    }

    return resp(200, {
      ok: true,
      customer_id,
      saldo,
      saldo_por_vencer,
      saldo_vencido,
      cupo,
      disponible: Math.max(0, cupo - saldo),
      moneda: "COP",
    });
  } catch (err) {
    console.error("Cartera error:", err);
    return resp(500, {
      ok: false,
      message: err?.message || "Error consultando cartera",
      customer_id,
    });
  }
}
