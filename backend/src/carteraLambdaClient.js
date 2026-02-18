/**
 * Cliente para el endpoint Lambda de cartera (AWS).
 * GET con Content-Type: application/json y params: data (JSON), tool_name.
 * Sustituto/alternativa cuando el proveedor directo no devuelve datos desde el servidor.
 */
import axios from 'axios';

const CARTERA_LAMBDA_URL = process.env.CARTERA_LAMBDA_URL || '';
const CARTERA_LAMBDA_TIMEOUT_MS = Number(process.env.CARTERA_LAMBDA_TIMEOUT_MS) || 25000;

/**
 * Obtiene estado de cartera desde el Lambda.
 * @param {{ cedula: string }} params - cedula/NIT del cliente
 * @returns {Promise<{ data?: unknown, items?: Array<{ SALDO?: number, DAIAVEN?: number }>, error?: string }>}
 */
export async function estadoCarteraLambda({ cedula } = {}) {
  if (!CARTERA_LAMBDA_URL) {
    return { error: 'CARTERA_LAMBDA_URL no configurada' };
  }
  const customerId = String(cedula || '').replace(/\D/g, '').trim();
  if (!customerId) {
    return { error: 'cedula requerida' };
  }

  const dataParam = JSON.stringify({
    action: 'status',
    customer_id: customerId,
  });

  try {
    const response = await axios.get(CARTERA_LAMBDA_URL, {
      params: {
        data: dataParam,
        tool_name: 'cartera',
      },
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: CARTERA_LAMBDA_TIMEOUT_MS,
    });

    const body = response.data;
    if (!body || typeof body !== 'object') {
      return { error: 'Lambda respondió sin body válido', data: body };
    }

    const hasSaldo = (item) => {
      if (!item || typeof item !== 'object') return false;
      const v = item.SALDO ?? item.saldo ?? item.Saldo;
      return v !== null && v !== undefined && String(v).trim() !== '';
    };
    const findArray = (obj) => {
      if (!obj) return null;
      if (Array.isArray(obj)) return obj.some(hasSaldo) ? obj : null;
      if (typeof obj !== 'object') return null;
      const keys = ['items', 'data', 'result', 'Table', 'Data', 'Result', 'Body', 'documents', 'Rows', 'Records', 'Detalle'];
      for (const k of keys) {
        const v = obj[k];
        if (Array.isArray(v) && v.length > 0 && v.some(hasSaldo)) return v;
        if (Array.isArray(v) && v.length > 0) return v;
      }
      for (const v of Object.values(obj)) {
        const found = findArray(v);
        if (found) return found;
      }
      return null;
    };

    const items = Array.isArray(body)
      ? body
      : findArray(body) || [];

    return { data: body, items };
  } catch (err) {
    const message = err?.response?.data?.error || err?.response?.data?.message || err?.message || String(err);
    const code = err?.response?.status;
    return {
      error: message,
      code,
      details: err?.response?.data,
    };
  }
}
