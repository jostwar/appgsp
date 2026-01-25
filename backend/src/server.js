import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { cxc } from './cxcClient.js';
import { erp, isB2BApproved } from './erpClient.js';
import { woo } from './wooClient.js';

const app = express();
const port = process.env.PORT || 4000;
const CXC_POINTS_DIVISOR = Number(process.env.CXC_POINTS_DIVISOR || 10000);

const normalizeKey = (value) => String(value || '').toLowerCase();

const toNumber = (value) => {
  if (typeof value === 'number') return value;
  if (value === null || value === undefined) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;

  let cleaned = raw.replace(/[^\d.,-]/g, '');
  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');
  if (hasDot && hasComma) {
    cleaned = cleaned.replace(/\./g, '').replace(/,/g, '.');
  } else if (hasComma && !hasDot) {
    cleaned = cleaned.replace(/,/g, '.');
  }

  const parsed = Number.parseFloat(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const parseMaybeJson = (value) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return value;
  }
};

const sumTotalsForKey = (data, totalKey) => {
  const targetKey = normalizeKey(totalKey);
  let sum = 0;

  const walk = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== 'object') return;

    Object.entries(node).forEach(([key, value]) => {
      if (normalizeKey(key) === targetKey) {
        sum += toNumber(value);
      }
      if (typeof value === 'object') {
        walk(value);
      }
    });
  };

  walk(data);
  return sum;
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatNumber = (value) => {
  const number = Number(value || 0);
  return new Intl.NumberFormat('es-CO').format(
    Number.isNaN(number) ? 0 : number
  );
};

const renderRewardsPortal = ({
  cedula = '',
  points = null,
  total = null,
  error = null,
} = {}) => {
  const rewards = [
    { title: 'Dinero en saldo', points: '2.000 pts', value: '$20.000' },
    { title: 'Tarjeta regalo', points: '5.000 pts', value: '$60.000' },
    { title: 'Accesorios premium', points: '3.500 pts', value: 'Item' },
  ];
  const rates = [
    { label: '1.000 pts', value: '$10.000' },
    { label: '2.000 pts', value: '$20.000' },
    { label: '5.000 pts', value: '$60.000' },
  ];
  const steps = [
    {
      title: 'Acumula',
      description: 'Compra productos y gana puntos por cada pedido.',
    },
    {
      title: 'Elige',
      description: 'Selecciona dinero, gift cards o productos.',
    },
    { title: 'Canjea', description: 'Solicita el canje y recibe confirmación.' },
  ];
  const activity = [
    { title: 'Compra supermercado', points: '+450 pts', date: '21 ene 2026' },
    { title: 'Canje tarjeta regalo', points: '-5.000 pts', date: '10 ene 2026' },
  ];

  const pointsValue =
    points === null ? '—' : formatNumber(points);
  const totalValue =
    total === null ? '—' : `$${formatNumber(total)}`;

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GSPRewards - Portal</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0a0c11;
        --card: #121826;
        --surface: #1a2234;
        --text: #f0f8ff;
        --muted: rgba(240, 248, 255, 0.7);
        --accent: #00b5d6;
        --warning: #ffb020;
      }
      body {
        margin: 0;
        font-family: "Inter", system-ui, sans-serif;
        background: var(--bg);
        color: var(--text);
      }
      .container {
        max-width: 980px;
        margin: 0 auto;
        padding: 32px 20px 60px;
        display: flex;
        flex-direction: column;
        gap: 20px;
      }
      h1 {
        margin: 0;
        font-size: 26px;
      }
      .card {
        background: var(--card);
        border-radius: 18px;
        padding: 20px;
      }
      .row {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: var(--muted);
      }
      .pill .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--accent);
      }
      .value {
        font-size: 34px;
        font-weight: 700;
      }
      .muted {
        color: var(--muted);
        font-size: 13px;
      }
      .form {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      input[type="text"] {
        flex: 1;
        min-width: 220px;
        background: #0f1422;
        border: 1px solid #2a3347;
        border-radius: 12px;
        padding: 10px 12px;
        color: var(--text);
      }
      button {
        background: var(--accent);
        color: #fff;
        border: none;
        border-radius: 12px;
        padding: 10px 16px;
        font-weight: 600;
        cursor: pointer;
      }
      .grid {
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }
      .subcard {
        background: var(--surface);
        border-radius: 16px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .subcard h3 {
        margin: 0;
        font-size: 15px;
      }
      .subcard .label {
        font-size: 13px;
        color: var(--muted);
      }
      .conversion {
        display: flex;
        justify-content: space-between;
        font-size: 14px;
      }
      .activity {
        display: flex;
        justify-content: space-between;
        font-weight: 600;
      }
      .activity .earn { color: var(--accent); }
      .activity .redeem { color: var(--warning); }
      .alert {
        background: rgba(255, 176, 32, 0.15);
        border: 1px solid rgba(255, 176, 32, 0.4);
        color: var(--warning);
        padding: 12px 14px;
        border-radius: 12px;
        font-size: 13px;
      }
      .totals {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 12px;
      }
      .totals .item {
        background: #0f1422;
        border-radius: 12px;
        padding: 12px;
      }
      .totals .item span {
        display: block;
        color: var(--muted);
        font-size: 12px;
      }
      .totals .item strong {
        font-size: 18px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Portal GSPRewards</h1>
      <div class="card">
        <form class="form" method="get" action="/admin/rewards">
          <input type="text" name="cedula" placeholder="NIT o cédula" value="${escapeHtml(
            cedula
          )}" />
          <button type="submit">Consultar</button>
        </form>
        ${
          error
            ? `<div class="alert">Error: ${escapeHtml(error)}</div>`
            : ''
        }
        <div class="totals">
          <div class="item">
            <span>Saldo de puntos</span>
            <strong>${pointsValue}</strong>
          </div>
          <div class="item">
            <span>Total compras (CxC)</span>
            <strong>${totalValue}</strong>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="pill"><span class="dot"></span>Nivel Oro</div>
        <div class="value">${pointsValue}</div>
        <div class="muted">Próximo nivel en 1.550 pts</div>
      </div>

      <div class="card">
        <h2>Programa GSPRewards</h2>
        <div class="muted">Gana puntos por cada compra y canjéalos por dinero o productos.</div>
        <div class="grid">
          ${rewards
            .map(
              (reward) => `<div class="subcard">
                <h3>${reward.title}</h3>
                <div class="label">${reward.points}</div>
                <div class="label">${reward.value}</div>
                <button type="button">Canjear</button>
              </div>`
            )
            .join('')}
        </div>
      </div>

      <div class="card">
        <h2>Conversión rápida</h2>
        <div class="subcard">
          ${rates
            .map(
              (rate) => `<div class="conversion">
                <span class="muted">${rate.label}</span>
                <strong>${rate.value}</strong>
              </div>`
            )
            .join('')}
          <button type="button" onclick="window.open('https://wa.me/573103611116')">
            Solicitar canje
          </button>
        </div>
      </div>

      <div class="card">
        <h2>¿Cómo funciona GSPRewards?</h2>
        <div class="grid">
          ${steps
            .map(
              (step) => `<div class="subcard">
                <h3>${step.title}</h3>
                <div class="label">${step.description}</div>
              </div>`
            )
            .join('')}
        </div>
      </div>

      <div class="card">
        <h2>Actividad reciente</h2>
        ${activity
          .map(
            (item) => `<div class="subcard">
              <div class="activity">
                <span>${item.title}</span>
                <span class="${item.points.startsWith('-') ? 'redeem' : 'earn'}">${item.points}</span>
              </div>
              <div class="muted">${item.date}</div>
            </div>`
          )
          .join('')}
      </div>
    </div>
  </body>
</html>`;
};

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const parseBasicAuth = (header) => {
  if (!header || !header.startsWith('Basic ')) return null;
  const encoded = header.replace('Basic ', '').trim();
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const [username, ...rest] = decoded.split(':');
    const password = rest.join(':');
    if (!username || !password) return null;
    return { username, password };
  } catch (_error) {
    return null;
  }
};

const adminAuth = async (req, res, next) => {
  try {
    const credentials = parseBasicAuth(req.headers.authorization);
    if (!credentials) {
      res.setHeader('WWW-Authenticate', 'Basic realm="GSP Admin"');
      return res.status(401).send('Autenticación requerida.');
    }

    const login = await woo.login({
      email: credentials.username,
      password: credentials.password,
    });
    const token = login?.token;
    const profile = await woo.getWpUserMe(token);
    const roles = Array.isArray(profile?.roles) ? profile.roles : [];
    if (!roles.includes('administrator')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="GSP Admin"');
      return res.status(403).send('Acceso restringido.');
    }

    req.adminUser = profile;
    return next();
  } catch (_error) {
    res.setHeader('WWW-Authenticate', 'Basic realm="GSP Admin"');
    return res.status(401).send('Credenciales inválidas.');
  }
};

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/admin', adminAuth, (_req, res) => {
  res.redirect('/admin/rewards');
});

app.get('/admin/rewards', adminAuth, async (req, res) => {
  const cedula = String(req.query.cedula || '').trim();
  if (!cedula) {
    return res.send(renderRewardsPortal());
  }

  try {
    const data = await cxc.detalleFacturasPedido({
      strPar_Cedula: cedula,
    });
    const payload = parseMaybeJson(
      data.result ?? data.response ?? data.parsed ?? {}
    );
    const total = sumTotalsForKey(payload, 'total');
    const points = CXC_POINTS_DIVISOR > 0 ? Math.floor(total / CXC_POINTS_DIVISOR) : 0;
    return res.send(
      renderRewardsPortal({ cedula, total, points })
    );
  } catch (error) {
    return res.send(
      renderRewardsPortal({
        cedula,
        error: error?.response?.data || error?.message || 'No se pudo calcular',
      })
    );
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { identificacion, tipo } = req.body || {};
    if (!identificacion || !tipo) {
      return res.status(400).json({
        error: 'identificacion y tipo son requeridos',
      });
    }

    const customer = await erp.getCustomer({ identificacion, tipo });
    const approved = isB2BApproved(customer);
    if (!approved) {
      return res.status(403).json({
        error: 'Cliente no aprobado (B2B Approved)',
      });
    }

    const session = await erp.login({ identificacion, tipo });
    return res.json({ session, customer });
  } catch (error) {
    return res.status(500).json({
      error: 'No se pudo iniciar sesión',
      details: error?.response?.data || error?.message,
    });
  }
});

app.get('/api/customers/:identificacion', async (req, res) => {
  try {
    const { identificacion } = req.params;
    const { tipo } = req.query;
    if (!tipo) {
      return res.status(400).json({ error: 'tipo es requerido' });
    }
    const customer = await erp.getCustomer({ identificacion, tipo });
    return res.json(customer);
  } catch (error) {
    return res.status(500).json({
      error: 'No se pudo obtener cliente',
      details: error?.response?.data || error?.message,
    });
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    const { identificacion, tipo, page, perPage } = req.query;
    if (!identificacion || !tipo) {
      return res
        .status(400)
        .json({ error: 'identificacion y tipo son requeridos' });
    }
    const data = await erp.getOrders({
      identificacion,
      tipo,
      page,
      perPage,
    });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      error: 'No se pudo obtener compras',
      details: error?.response?.data || error?.message,
    });
  }
});

app.get('/api/points', async (req, res) => {
  try {
    const { identificacion, tipo } = req.query;
    if (!identificacion || !tipo) {
      return res
        .status(400)
        .json({ error: 'identificacion y tipo son requeridos' });
    }
    const data = await erp.getPoints({ identificacion, tipo });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      error: 'No se pudo obtener puntos',
      details: error?.response?.data || error?.message,
    });
  }
});

app.get('/api/points/history', async (req, res) => {
  try {
    const { identificacion, tipo, page, perPage } = req.query;
    if (!identificacion || !tipo) {
      return res
        .status(400)
        .json({ error: 'identificacion y tipo son requeridos' });
    }
    const data = await erp.getPointsHistory({
      identificacion,
      tipo,
      page,
      perPage,
    });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      error: 'No se pudo obtener historial de puntos',
      details: error?.response?.data || error?.message,
    });
  }
});

app.get('/api/woo/customer', async (req, res) => {
  try {
    const { cedula, perPage, maxPages, orderBy, order, role } = req.query;
    if (!cedula) {
      return res.status(400).json({ error: 'cedula es requerida' });
    }
    const customer = await woo.findCustomerByCedula(cedula, {
      perPage: perPage ? Number(perPage) : undefined,
      maxPages: maxPages ? Number(maxPages) : undefined,
      orderBy,
      order,
      role,
    });
    if (!customer) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    const points = woo.getCustomerPoints(customer);
    return res.json({ customer, points });
  } catch (error) {
    return res.status(500).json({
      error: 'No se pudo obtener cliente en WooCommerce',
      details: error?.response?.data || error?.message,
    });
  }
});

app.get('/api/woo/points', async (req, res) => {
  try {
    const { cedula, perPage, maxPages, orderBy, order, role } = req.query;
    if (!cedula) {
      return res.status(400).json({ error: 'cedula es requerida' });
    }
    const customer = await woo.findCustomerByCedula(cedula, {
      perPage: perPage ? Number(perPage) : undefined,
      maxPages: maxPages ? Number(maxPages) : undefined,
      orderBy,
      order,
      role,
    });
    if (!customer) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    const points = woo.getCustomerPoints(customer);
    return res.json({ points: points ?? 0 });
  } catch (error) {
    return res.status(500).json({
      error: 'No se pudieron obtener puntos de WooCommerce',
      details: error?.response?.data || error?.message,
    });
  }
});

app.get('/api/woo/meta-keys', async (req, res) => {
  try {
    const { perPage, pages } = req.query;
    const keys = await woo.listMetaKeys({
      perPage: perPage ? Number(perPage) : undefined,
      pages: pages ? Number(pages) : undefined,
    });
    return res.json({ keys });
  } catch (error) {
    return res.status(500).json({
      error: 'No se pudieron listar meta keys de WooCommerce',
      details: error?.response?.data || error?.message,
    });
  }
});

app.get('/api/woo/cedulas', async (req, res) => {
  try {
    const { perPage, pages, limit, orderBy, order, role } = req.query;
    const items = await woo.listCedulas({
      perPage: perPage ? Number(perPage) : undefined,
      pages: pages ? Number(pages) : undefined,
      limit: limit ? Number(limit) : undefined,
      orderBy,
      order,
      role,
    });
    return res.json({ items });
  } catch (error) {
    return res.status(500).json({
      error: 'No se pudieron listar cédulas de WooCommerce',
      details: error?.response?.data || error?.message,
    });
  }
});

app.post('/api/woo/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email y password son requeridos' });
    }
    const data = await woo.login({ email, password });
    return res.json({
      token: data?.token,
      user: {
        id: data?.user_id,
        email: data?.user_email,
        name: data?.user_display_name,
        nicename: data?.user_nicename,
      },
    });
  } catch (error) {
    return res.status(401).json({
      error: 'Credenciales inválidas o JWT no configurado',
      details: error?.response?.data || error?.message,
    });
  }
});

app.post('/api/cxc/call', async (req, res) => {
  try {
    const { method, params, debug } = req.body || {};
    if (!method) {
      return res.status(400).json({ error: 'method es requerido' });
    }
    const data = await cxc.call(method, params);
    if (debug) {
      return res.json(data);
    }
    return res.json(data.result ?? data.response ?? data.parsed ?? {});
  } catch (error) {
    return res.status(500).json({
      error: 'No se pudo ejecutar el servicio CxC',
      details: error?.response?.data || error?.message,
    });
  }
});

app.get('/api/cxc/estado-cartera', async (req, res) => {
  try {
    const { fecha, cedula, vendedor, debug } = req.query;
    if (!fecha) {
      return res.status(400).json({ error: 'fecha es requerida' });
    }
    const data = await cxc.estadoCartera({ fecha, cedula, vendedor });
    if (debug) {
      return res.json(data);
    }
    return res.json(data.result ?? data.response ?? data.parsed ?? {});
  } catch (error) {
    return res.status(500).json({
      error: 'No se pudo consultar estado de cartera',
      details: error?.response?.data || error?.message,
    });
  }
});

app.get('/api/cxc/clientes', async (req, res) => {
  try {
    const { vendedor, filas, pagina, debug } = req.query;
    const data = await cxc.listadoClientes({
      vendedor,
      filas: filas ? Number(filas) : undefined,
      pagina: pagina ? Number(pagina) : undefined,
    });
    if (debug) {
      return res.json(data);
    }
    return res.json(data.result ?? data.response ?? data.parsed ?? {});
  } catch (error) {
    return res.status(500).json({
      error: 'No se pudo consultar listado de clientes',
      details: error?.response?.data || error?.message,
    });
  }
});

app.post('/api/cxc/detalle-facturas', async (req, res) => {
  try {
    const { params, debug } = req.body || {};
    const data = await cxc.detalleFacturasPedido(params || {});
    if (debug) {
      return res.json(data);
    }
    return res.json(data.result ?? data.response ?? data.parsed ?? {});
  } catch (error) {
    return res.status(500).json({
      error: 'No se pudo consultar detalle de facturas',
      details: error?.response?.data || error?.message,
    });
  }
});

app.post('/api/cxc/trazabilidad', async (req, res) => {
  try {
    const { params, debug } = req.body || {};
    const data = await cxc.trazabilidadPedidos(params || {});
    if (debug) {
      return res.json(data);
    }
    return res.json(data.result ?? data.response ?? data.parsed ?? {});
  } catch (error) {
    return res.status(500).json({
      error: 'No se pudo consultar trazabilidad de pedidos',
      details: error?.response?.data || error?.message,
    });
  }
});

app.post('/api/cxc/points', async (req, res) => {
  try {
    const { cedula, fecha, params, totalKey, divisor, debug } = req.body || {};
    if (!cedula && !params) {
      return res.status(400).json({ error: 'cedula o params son requeridos' });
    }

    const callParams = { ...(params || {}) };
    if (cedula && !callParams.strPar_Cedula) {
      callParams.strPar_Cedula = cedula;
    }
    if (fecha && !callParams.datPar_Fecha) {
      callParams.datPar_Fecha = fecha;
    }

    const data = await cxc.detalleFacturasPedido(callParams);
    if (debug) {
      return res.json(data);
    }

    const payload = parseMaybeJson(
      data.result ?? data.response ?? data.parsed ?? {}
    );
    const keyToUse = totalKey || 'total';
    const total = sumTotalsForKey(payload, keyToUse);
    const divisorValue = Number(divisor || CXC_POINTS_DIVISOR || 10000);
    const points = divisorValue > 0 ? Math.floor(total / divisorValue) : 0;

    return res.json({
      total,
      points,
      divisor: divisorValue,
      totalKey: keyToUse,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'No se pudieron calcular puntos desde CxC',
      details: error?.response?.data || error?.message,
    });
  }
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listo en http://localhost:${port}`);
});
