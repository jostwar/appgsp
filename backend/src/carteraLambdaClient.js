/**
 * Cliente para el endpoint Lambda de cartera (AWS).
 * POST con Content-Type: application/json y body: { data: { action, customer_id, fecha?, vendedor? }, tool_name }.
 * Compatible con Lambda que devuelve totales en raíz o en summary (saldo_total, saldo_por_vencer, saldo_vencido).
 */
import axios from 'axios';

const CARTERA_LAMBDA_URL = process.env.CARTERA_LAMBDA_URL || '';
const CARTERA_LAMBDA_TIMEOUT_MS = Number(process.env.CARTERA_LAMBDA_TIMEOUT_MS) || 25000;

/**
 * Obtiene estado de cartera desde el Lambda.
 * @param {{ cedula: string, fecha?: string, vendedor?: string }} params
 * @returns {Promise<{ data?: unknown, items?: Array, error?: string }>}
 */
export async function estadoCarteraLambda({ cedula, fecha, vendedor } = {}) {
  if (!CARTERA_LAMBDA_URL) {
    return { error: 'CARTERA_LAMBDA_URL no configurada' };
  }
  const customerId = String(cedula || '').replace(/\D/g, '').trim();
  if (!customerId) {
    return { error: 'cedula requerida' };
  }

  const requestBody = {
    data: {
      action: 'status',
      customer_id: customerId,
      fecha: fecha || new Date().toISOString().slice(0, 10),
      vendedor: String(vendedor || '').trim(),
    },
    tool_name: 'cartera',
  };

  try {
    const response = await axios.post(CARTERA_LAMBDA_URL, requestBody, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: CARTERA_LAMBDA_TIMEOUT_MS,
    });

    const body = response.data;
    if (!body || typeof body !== 'object') {
      return { error: 'Lambda respondió sin body válido', data: body };
    }
    if (body.ok === false) {
      return { error: body.message || 'Lambda respondió con ok: false', data: body };
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
      const keys = ['data', 'items', 'result', 'Table', 'Data', 'Result', 'Body', 'documents', 'Rows', 'Records', 'Detalle'];
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
