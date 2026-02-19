/**
 * fom-cartera (Node.js 24) — STATUS de cartera desde SOAP Fomplus
 * Compatible con:
 * - Lambda Function URL
 * - API Gateway proxy
 * - Achieve Apex (payload envuelto en { data: {...}, tool_name: "..." })
 *
 * Request esperado (Apex):
 * { "data": { "action":"status", "customer_id":"901188568", "fecha":"2026-02-04", "vendedor":"" }, "tool_name":"cartera" }
 *
 * Response:
 * - summary: totales
 * - result : totales formateados COP sin decimales
 * - items  : [{ num_documento, saldo, dias_vencidos }]
 * - data   : items numéricos
 *
 * Variables de entorno en Lambda:
 *   FOM_HOST, FOM_SOAP_PATH, FOM_SOAP_ACTION_CARTERA
 *   FOM_DB o FOM_BASEDATOS, FOM_TOKEN (no FOMPLUS_TOKEN)
 *   SOAP_TIMEOUT_MS, opcional ALLOW_PREFIXES
 */

const FOM_HOST = process.env.FOM_HOST || "https://cartera.fomplus.com";
const FOM_SOAP_PATH = process.env.FOM_SOAP_PATH || "/srvCxcPed.asmx";
const FOM_SOAP_ACTION_CARTERA =
  process.env.FOM_SOAP_ACTION_CARTERA || "http://tempuri.org/EstadoDeCuentaCartera";

const FOM_DB = process.env.FOM_DB || process.env.FOM_BASEDATOS || "";
const FOM_TOKEN = process.env.FOM_TOKEN || "";
const SOAP_TIMEOUT_MS = parseInt(process.env.SOAP_TIMEOUT_MS || "28000", 10);

const ALLOW_PREFIXES = (process.env.ALLOW_PREFIXES || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

function resp(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type,x-api-key",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    },
    body: JSON.stringify(bodyObj),
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
    const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
    return data;
  } catch {
    return null;
  }
}

function escXml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatCOP(n) {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  return `$${Math.trunc(v).toLocaleString("es-CO")} COP`;
}

function toISODate(d) {
  if (!d) return new Date().toISOString().slice(0, 10);
  if (typeof d === "string") return d.slice(0, 10);
  return new Date(d).toISOString().slice(0, 10);
}

function buildSoapBody({ fecha, customer_id, vendedor }) {
  const dt = `${toISODate(fecha)}T00:00:00`;
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <EstadoDeCuentaCartera xmlns="http://tempuri.org/">
      <strPar_Basedatos>${escXml(FOM_DB)}</strPar_Basedatos>
      <strPar_Token>${escXml(FOM_TOKEN)}</strPar_Token>
      <datPar_Fecha>${escXml(dt)}</datPar_Fecha>
      <strPar_Cedula>${escXml(customer_id)}</strPar_Cedula>
      <strPar_Vended>${escXml(vendedor || "")}</strPar_Vended>
    </EstadoDeCuentaCartera>
  </soap:Body>
</soap:Envelope>`;
}

function extractJsonArrayFromSoapText(xmlText) {
  const m = xmlText.match(/<EstadoDeCuentaCarteraResult[^>]*>([\s\S]*?)<\/EstadoDeCuentaCarteraResult>/i);
  let candidate = m ? m[1] : "";
  if (candidate && /&quot;|&amp;|&lt;|&gt;/.test(candidate)) {
    candidate = candidate
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }
  const textToScan = candidate && candidate.includes("[") ? candidate : xmlText;
  const i = textToScan.indexOf("[");
  const j = textToScan.lastIndexOf("]");
  if (i === -1 || j === -1 || j <= i) {
    return { ok: false, error: "No se encontró array JSON en la respuesta SOAP", raw: xmlText.slice(0, 500) };
  }
  const jsonStr = textToScan.slice(i, j + 1);
  try {
    const arr = JSON.parse(jsonStr);
    if (!Array.isArray(arr)) return { ok: false, error: "Respuesta JSON pero no es array", raw: jsonStr.slice(0, 500) };
    return { ok: true, arr, rawSnippet: jsonStr.slice(0, 500) };
  } catch (e) {
    return { ok: false, error: "No se pudo parsear el array JSON", raw: jsonStr.slice(0, 500) };
  }
}

async function fetchSoapOnce(bodyXml) {
  const url = `${FOM_HOST}${FOM_SOAP_PATH}`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), SOAP_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"${FOM_SOAP_ACTION_CARTERA}"`,
      },
      body: bodyXml,
      signal: ac.signal,
    });
    const text = await r.text();
    return { ok: true, status: r.status, text };
  } catch (e) {
    if (String(e?.name) === "AbortError") {
      return { ok: false, timeout: true, error: `SOAP timeout (${SOAP_TIMEOUT_MS}ms)` };
    }
    return { ok: false, timeout: false, error: String(e?.message || e) };
  } finally {
    clearTimeout(t);
  }
}

async function fetchSoapWithRetry(bodyXml) {
  const first = await fetchSoapOnce(bodyXml);
  if (first.ok) return first;
  if (first.timeout) {
    await new Promise(r => setTimeout(r, 800));
    const second = await fetchSoapOnce(bodyXml);
    return second.ok ? second : first;
  }
  return first;
}

function computeTotals(rows) {
  let saldo_total = 0;
  let saldo_vencido = 0;
  let saldo_por_vencer = 0;
  for (const r of rows) {
    const s = Number(r?.SALDO || 0) || 0;
    saldo_total += s;
    const dv = Number(r?.DAIAVEN ?? 0) || 0;
    if (dv > 0) saldo_vencido += s;
    else saldo_por_vencer += s;
  }
  saldo_total = Math.trunc(saldo_total);
  saldo_vencido = Math.trunc(saldo_vencido);
  saldo_por_vencer = Math.trunc(saldo_por_vencer);
  return { saldo_total, saldo_por_vencer, saldo_vencido };
}

export async function handler(event) {
  const method =
    event?.requestContext?.http?.method ||
    event?.requestContext?.httpMethod ||
    event?.httpMethod ||
    "POST";

  if (method === "OPTIONS") return resp(200, { ok: true });

  const data = parseEvent(event);
  if (!data) return resp(400, { ok: false, message: "Body JSON inválido" });

  const action = String(data.action || "status").toLowerCase();
  if (!["status"].includes(action)) {
    return resp(400, { ok: false, message: "Falta action (status)" });
  }

  const customer_id = String(data.customer_id || "").trim();
  const fecha = data.fecha || new Date().toISOString().slice(0, 10);
  const vendedor = data.vendedor || "";

  if (!customer_id) return resp(400, { ok: false, message: "Falta customer_id" });
  if (!FOM_DB) return resp(500, { ok: false, message: "FOM_DB/FOM_BASEDATOS no configurado" });
  if (!FOM_TOKEN) return resp(500, { ok: false, message: "FOM_TOKEN no configurado" });

  const soapBody = buildSoapBody({ fecha, customer_id, vendedor });

  const soap = await fetchSoapWithRetry(soapBody);
  if (!soap.ok) {
    return resp(504, {
      ok: false,
      message: soap.timeout ? "SOAP timeout" : "Error llamando a SOAP",
      error: soap.error,
      source: { url: `${FOM_HOST}${FOM_SOAP_PATH}`, soapAction: FOM_SOAP_ACTION_CARTERA },
    });
  }

  const extracted = extractJsonArrayFromSoapText(soap.text);
  if (!extracted.ok) {
    return resp(200, {
      ok: true,
      request: { customer_id, fecha: toISODate(fecha), vendedor },
      source: { url: `${FOM_HOST}${FOM_SOAP_PATH}`, soapAction: FOM_SOAP_ACTION_CARTERA },
      summary: {
        saldo_total: 0,
        saldo_por_vencer: 0,
        saldo_vencido: 0,
        cupo: 0,
        disponible: 0,
        documentos: 0,
      },
      result: {
        saldo: formatCOP(0),
        saldo_por_vencer: formatCOP(0),
        saldo_vencido: formatCOP(0),
        cupo: formatCOP(0),
        disponible: formatCOP(0),
      },
      items: [],
      data: [],
      warning: extracted.error,
      rawSnippet: extracted.raw,
    });
  }

  let rows = extracted.arr || [];
  if (ALLOW_PREFIXES.length > 0) {
    rows = rows.filter(r => ALLOW_PREFIXES.includes(String(r?.PREFIJ || "").trim()));
  }

  const normalized = rows.map(r => ({
    ...r,
    SALDO: Math.trunc(Number(r?.SALDO || 0) || 0),
  }));

  const totals = computeTotals(normalized);
  const cupo = 0;
  const disponible = Math.trunc(cupo - totals.saldo_total);

  const items = normalized.map(r => ({
    num_documento: String(r?.NUMDOC || ""),
    saldo: formatCOP(r?.SALDO || 0),
    dias_vencidos: Number(r?.DAIAVEN ?? 0) || 0,
  }));

  const dataOut = normalized.map(r => ({
    num_documento: String(r?.NUMDOC || ""),
    saldo: Math.trunc(Number(r?.SALDO || 0) || 0),
    dias_vencidos: Number(r?.DAIAVEN ?? 0) || 0,
    fecha: String(r?.FECHA || ""),
    fecha_vencimiento: String(r?.FECVEN || ""),
    prefijo: String(r?.PREFIJ || ""),
  }));

  const summary = {
    saldo_total: totals.saldo_total,
    saldo_por_vencer: totals.saldo_por_vencer,
    saldo_vencido: totals.saldo_vencido,
    cupo,
    disponible,
    documentos: normalized.length,
  };

  return resp(200, {
    ok: true,
    request: { customer_id, fecha: toISODate(fecha), vendedor },
    source: { url: `${FOM_HOST}${FOM_SOAP_PATH}`, soapAction: FOM_SOAP_ACTION_CARTERA },
    parser: { mode: "json_bracket_extract_with_retry" },
    summary,
    result: {
      saldo: formatCOP(summary.saldo_total),
      saldo_por_vencer: formatCOP(summary.saldo_por_vencer),
      saldo_vencido: formatCOP(summary.saldo_vencido),
      cupo: formatCOP(summary.cupo),
      disponible: formatCOP(summary.disponible),
    },
    items,
    data: dataOut,
    rawSnippet: extracted.rawSnippet,
  });
}
