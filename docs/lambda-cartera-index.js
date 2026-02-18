/**
 * Lambda fom-cartera — Consulta de cartera (SOAP Fomplus)
 * Compatible con el body: { data: { action, customer_id }, tool_name: "cartera" }
 *
 * En AWS: Node 18+; subir como index.mjs o index.js con "type": "module".
 *
 * Variables de entorno (las que ya tienes en la Lambda):
 *   FOM_HOST, FOM_SOAP_PATH, FOM_SOAP_ACTION_CARTERA, FOMPLUS_TOKEN, FOM_BASEDATOS, SOAP_TIMEOUT_MS
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

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Construye el SOAP envelope para EstadoDeCuentaCartera (igual que el backend Node) */
function buildSoapEnvelope(params) {
  const method = "EstadoDeCuentaCartera";
  const ns = "http://tempuri.org/";
  const entries = Object.entries(params || {});
  const bodyParams = entries
    .map(([key, value]) => `<${key}>${escapeXml(value)}</${key}>`)
    .join("");
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
    "<soap:Body>",
    `<${method} xmlns="${ns}">`,
    bodyParams,
    `</${method}>`,
    "</soap:Body>",
    "</soap:Envelope>",
  ].join("");
}

/** Extrae el contenido de EstadoDeCuentaCarteraResult del XML SOAP (puede ser JSON o texto) */
function extractSoapResult(xml) {
  const str = String(xml || "");
  const match = str.match(
    /<[^>]*EstadoDeCuentaCarteraResult[^>]*>([\s\S]*?)<\/[^>]*EstadoDeCuentaCarteraResult>/i
  );
  if (!match) return null;
  const inner = (match[1] || "").trim();
  if (inner.startsWith("{") || inner.startsWith("[")) {
    try {
      return JSON.parse(inner);
    } catch {
      return inner;
    }
  }
  return inner;
}

/** Llama a Fomplus por SOAP (usa FOM_HOST, FOMPLUS_TOKEN, FOM_BASEDATOS, etc.) */
async function fetchCarteraFromFomplus(customer_id) {
  const host = (process.env.FOM_HOST || "").replace(/\/$/, "");
  const path = process.env.FOM_SOAP_PATH || "/srvCxcPed.asmx";
  const soapAction = process.env.FOM_SOAP_ACTION_CARTERA || "http://tempuri.org/EstadoDeCuentaCartera";
  const token = process.env.FOMPLUS_TOKEN || "";
  const basedatos = process.env.FOM_BASEDATOS || "";
  const timeoutMs = Number(process.env.SOAP_TIMEOUT_MS) || 28000;

  if (!host) throw new Error("FOM_HOST no configurada en Lambda");
  if (!token) throw new Error("FOMPLUS_TOKEN no configurado en Lambda");
  if (!basedatos) throw new Error("FOM_BASEDATOS no configurada en Lambda");

  const fecha = new Date().toISOString().slice(0, 10);
  const envelope = buildSoapEnvelope({
    strPar_Basedatos: basedatos,
    strPar_Token: token,
    datPar_Fecha: fecha,
    strPar_Cedula: String(customer_id),
    strPar_Vended: "",
  });

  const url = `${host}${path.startsWith("/") ? path : "/" + path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: soapAction,
    },
    body: envelope,
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  if (!res.ok) throw new Error(`Fomplus SOAP: ${res.status} ${res.statusText}`);
  const xml = await res.text();
  const result = extractSoapResult(xml);
  if (result === null) throw new Error("Fomplus no devolvió EstadoDeCuentaCarteraResult");
  return result;
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
    const apiPayload = await fetchCarteraFromFomplus(customer_id);
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
