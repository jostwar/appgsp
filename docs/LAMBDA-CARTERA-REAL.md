# Lambda fom-cartera: reemplazar mock por API real

El Lambda actual devuelve **valores fijos** (mock). Para que cada cliente vea sus saldos reales, hay que llamar a la API de cartera (Fomplus/CXC) con `customer_id` y calcular los totales desde la respuesta.

## Variables de entorno del Lambda (configurar en AWS)

- `FOMPLUS_API_URL` o `CXC_API_URL` — URL del servicio de cartera (ej. la que usa el backend Node).
- `CXC_TOKEN` (o el header que use la API).
- `CXC_EMPRESA` si la API lo requiere.
- Opcional: `FOMPLUS_FECHA` o usar fecha del día en YYYY-MM-DD.

## Código sugerido para el handler

```javascript
/**
 * fom-cartera — Consulta de cartera (con llamada real a API)
 * Acciones: status
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

const SALDO_KEYS = ["saldo", "saldototal", "total", "total_cartera"];
const POR_VENCER_KEYS = ["por_vencer", "porvencer", "saldo_por_vencer"];
const VENCIDO_KEYS = ["vencido", "saldo_vencido", "vencido_total"];
const CUPO_KEYS = ["cupo", "cupo_credito", "cli_cupcre", "limite_credito"];

function findVal(obj, keys) {
  if (!obj || typeof obj !== "object") return "";
  const lower = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const targets = new Set(keys.map(lower));
  for (const [k, v] of Object.entries(obj)) {
    if (targets.has(lower(k)) && v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/** Extrae array de ítems del payload de la API (Table, Data, Result, etc.) */
function getItems(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (typeof payload === "object") {
    const wrap = ["table", "data", "result", "rows", "items", "documentos"];
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

/** Suma saldo, por_vencer, vencido desde array de documentos (misma lógica que el backend Node) */
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
      const dias = Number(findVal(item, ["daiaven", "diasvenc", "dias_venc"]) || item?.DAIAVEN || 0);
      saldo += s;
      if (dias > 0) vencido += s;
      else porVencer += s;
    }
    const c = parseNum(findVal(item, CUPO_KEYS));
    if (c > 0) cupo = c;
  }
  return { saldo, porVencer, vencido, cupo };
}

/** Llama a la API de cartera (Fomplus/CXC). Ajustar URL, headers y body según tu API. */
async function fetchCarteraFromApi(customer_id) {
  const baseUrl = process.env.FOMPLUS_API_URL || process.env.CXC_API_URL;
  if (!baseUrl) throw new Error("FOMPLUS_API_URL o CXC_API_URL no configurada");

  const fecha = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const token = process.env.CXC_TOKEN || "";
  const empresa = process.env.CXC_EMPRESA || "";

  // Ejemplo: GET con query (ajusta a lo que use tu API)
  const url = `${baseUrl.replace(/\/$/, "")}?cedula=${encodeURIComponent(customer_id)}&fecha=${fecha}&empresa=${encodeURIComponent(empresa)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) throw new Error(`API cartera: ${res.status} ${res.statusText}`);
  const data = await res.json();
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
    const apiPayload = await fetchCarteraFromApi(customer_id);
    const items = getItems(apiPayload);

    let saldo = 0, saldo_por_vencer = 0, saldo_vencido = 0, cupo = 0, disponible = 0;

    if (items.length > 0) {
      const t = totalsFromItems(items);
      saldo = t.saldo;
      saldo_por_vencer = t.porVencer;
      saldo_vencido = t.vencido;
      cupo = t.cupo;
    }

    // Si la API devuelve totales en raíz en vez de array, usarlos
    if (saldo === 0 && saldo_por_vencer === 0 && saldo_vencido === 0) {
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
      disponible: cupo - saldo,
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
```

## Qué hay que ajustar en tu entorno

1. **URL y auth**  
   La función `fetchCarteraFromApi` está pensada para un GET con `cedula`, `fecha`, `empresa`. Si tu API es POST, usa otro path o otro cuerpo; cambia solo esa función manteniendo el mismo contrato: recibir `customer_id` y devolver el payload crudo de la API (objeto o array).

2. **Formato de respuesta de la API**  
   Si la API devuelve el array en otra clave (por ejemplo `EstadoDeCuentaCarteraResult.Table`), añádela en `getItems` en la lista `wrap` o con un `if (payload.EstadoDeCuentaCarteraResult)` y `return getItems(payload.EstadoDeCuentaCarteraResult)`.

3. **Cupo**  
   Si el cupo no viene en los ítems sino de otro endpoint o del cliente, puedes seguir leyendo `cupo` de tu base de datos o de otra llamada y asignar `cupo` (y `disponible = cupo - saldo`) en el objeto que devuelves en `resp(200, { ... })`.

Con esto el Lambda deja de ser mock y devuelve saldos reales por `customer_id`; el backend de la app ya está preparado para ese formato.
