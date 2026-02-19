/**
 * Estado de cartera: solo llama a la Lambda del usuario.
 * POST a CARTERA_LAMBDA_URL con { data: { action, customer_id }, tool_name: "cartera" }.
 */
import axios from 'axios';

const CARTERA_LAMBDA_URL =
  process.env.CARTERA_LAMBDA_URL ||
  'https://rue2usb4cwm63vhvmebk7ydf6y0ekuln.lambda-url.us-west-2.on.aws/';
const CARTERA_LAMBDA_TIMEOUT_MS = Number(process.env.CARTERA_LAMBDA_TIMEOUT_MS) || 30000;

function parseNum(v) {
  if (typeof v === 'number') return v;
  const raw = String(v || '').replace(/[^\d.-]/g, '');
  return raw ? (Number.parseFloat(raw) || 0) : 0;
}

/**
 * Llama a la Lambda y devuelve { summary: { cupoCredito, saldoCartera, saldoPorVencer, saldoVencido } } o { error }.
 * @param {{ cedula: string }} opts
 */
export async function estadoCarteraLambda({ cedula } = {}) {
  const customer_id = String(cedula || '').replace(/\D/g, '').trim();
  if (!customer_id) return { error: 'cedula requerida' };

  try {
    const res = await axios.post(
      CARTERA_LAMBDA_URL,
      {
        data: { action: 'status', customer_id },
        tool_name: 'cartera',
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: CARTERA_LAMBDA_TIMEOUT_MS,
      }
    );

    const body = res.data;
    if (!body || typeof body !== 'object') return { error: 'Lambda sin body válido' };
    if (body.ok === false) return { error: body.message || 'Lambda ok: false' };

    let cupoCredito = 0, saldoCartera = 0, saldoPorVencer = 0, saldoVencido = 0;

    const s = body.summary && typeof body.summary === 'object' ? body.summary : body;
    cupoCredito = parseNum(s.cupo);
    saldoCartera = parseNum(s.saldo_total ?? s.saldo);
    saldoPorVencer = parseNum(s.saldo_por_vencer);
    saldoVencido = parseNum(s.saldo_vencido);

    return {
      summary: {
        cupoCredito,
        saldoCartera,
        saldoPorVencer,
        saldoVencido,
      },
    };
  } catch (err) {
    const msg = err?.response?.data?.message ?? err?.message ?? String(err);
    return { error: msg };
  }
}
