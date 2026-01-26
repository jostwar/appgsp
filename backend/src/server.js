import './env.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cxc } from './cxcClient.js';
import { erp, isB2BApproved } from './erpClient.js';
import { woo } from './wooClient.js';

const app = express();
const port = process.env.PORT || 4000;
const CXC_POINTS_DIVISOR = Number(process.env.CXC_POINTS_DIVISOR || 10000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rewardsPath = path.resolve(__dirname, '../data', 'rewards.json');
const gspCarePath = path.resolve(__dirname, '../data', 'gspcare.json');

const normalizeKey = (value) => String(value || '').toLowerCase();
const normalizeId = (value) => String(value || '').replace(/\D+/g, '').trim();

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

const isCxcFunctionInactive = (xml) => {
  const text = String(xml || '').toLowerCase();
  return text.includes('funcion no activa') || text.includes('función no activa');
};

const normalizeField = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const CLIENT_ID_KEYS = [
  'cedula',
  'nit',
  'documento',
  'identificacion',
  'identificación',
  'strcli_cedula',
  'strcli_nit',
  'strcli_documento',
  'strpar_cedula',
  'strpar_nit',
  'strpar_documento',
  'cliente_nit',
  'cliente_cedula',
];
const CLIENT_NAME_KEYS = [
  'nombre',
  'nombrecliente',
  'nombre_cliente',
  'nombre_completo',
  'razonsocial',
  'razon_social',
  'cliente',
  'strcli_nombre',
  'strpar_nombre',
  'strcli_razon',
  'strpar_razonsocial',
];
const CLIENT_EMAIL_KEYS = ['correo', 'email', 'correo_electronico', 'mail'];
const CLIENT_PHONE_KEYS = ['telefono', 'tel', 'celular', 'movil', 'whatsapp'];
const CLIENT_CITY_KEYS = ['ciudad', 'municipio', 'poblacion'];
const CLIENT_ADDRESS_KEYS = ['direccion', 'dirección', 'address'];
const CLIENT_SELLER_KEYS = ['vendedor', 'asesor', 'strpar_vended', 'strcli_vendedor'];
const CLIENT_CUPO_KEYS = ['cupo', 'credito', 'creditolimit', 'cupo_credito'];
const CLIENT_PLAZO_KEYS = ['plazo', 'dias_credito', 'dias', 'plazodias'];

const findValueByKeys = (data, keys = []) => {
  if (!data) return '';
  const targets = new Set(keys.map(normalizeField));
  let found = '';

  const walk = (node) => {
    if (!node || found) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== 'object') return;

    Object.entries(node).forEach(([key, value]) => {
      if (found) return;
      const normalized = normalizeField(key);
      if (targets.has(normalized) && value !== null && value !== undefined) {
        const text = String(value).trim();
        if (text) {
          found = text;
          return;
        }
      }
      if (typeof value === 'object') {
        walk(value);
      }
    });
  };

  walk(data);
  return found;
};

const matchesCedulaValue = (value, target) => {
  if (!value || !target) return false;
  return normalizeId(value) === target;
};

const findClientByCedula = (data, cedula) => {
  const target = normalizeId(cedula);
  if (!target) return null;
  let match = null;

  const walk = (node) => {
    if (!node || match) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== 'object') return;

    const idValue = findValueByKeys(node, CLIENT_ID_KEYS);
    if (idValue && matchesCedulaValue(idValue, target)) {
      match = node;
      return;
    }

    const values = Object.values(node);
    if (values.some((value) => matchesCedulaValue(value, target))) {
      match = node;
      return;
    }

    values.forEach((value) => {
      if (typeof value === 'object') {
        walk(value);
      }
    });
  };

  walk(data);
  return match;
};

const buildClientInfo = (data, cedula) => {
  const match = findClientByCedula(data, cedula);
  if (!match) return null;
  return {
    cedula: normalizeId(findValueByKeys(match, CLIENT_ID_KEYS) || cedula),
    name: findValueByKeys(match, CLIENT_NAME_KEYS),
    email: findValueByKeys(match, CLIENT_EMAIL_KEYS),
    phone: findValueByKeys(match, CLIENT_PHONE_KEYS),
    city: findValueByKeys(match, CLIENT_CITY_KEYS),
    address: findValueByKeys(match, CLIENT_ADDRESS_KEYS),
    seller: findValueByKeys(match, CLIENT_SELLER_KEYS),
    cupo: findValueByKeys(match, CLIENT_CUPO_KEYS),
    plazo: findValueByKeys(match, CLIENT_PLAZO_KEYS),
  };
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

const formatDateTime = (value, { endOfDay = false } = {}) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (endOfDay) {
    parsed.setHours(23, 59, 59, 999);
  } else {
    parsed.setHours(0, 0, 0, 0);
  }
  return parsed.toISOString();
};

const buildCxcDetalleParams = ({ cedula, fecha } = {}) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = formatDateTime(fecha || startOfMonth);
  const to = formatDateTime(fecha || now, { endOfDay: true });
  return {
    strPar_Cedula: cedula,
    datPar_FecIni: from,
    datPar_FecFin: to,
    intPar_TipPed: 1,
    strPar_NumPed: '',
    strPar_Vended: '',
    intPar_Filas: 200,
    intPar_Pagina: 1,
  };
};

const LEVELS = [
  { name: 'Blue Partner', min: 5_000_000, max: 14_999_999, rebate: 1 },
  { name: 'Purple Partner', min: 15_000_000, max: 29_999_999, rebate: 1.5 },
  { name: 'Red Partner', min: 30_000_000, max: Infinity, rebate: 2 },
];
const BASE_LEVEL_GOAL = 5_000_000;
const BASE_LEVEL_REBATE = 1;

const getLevelForTotal = (total) => {
  const value = Number(total || 0);
  if (value <= 0) return 'Sin nivel';
  const match = LEVELS.find((level) => value >= level.min && value <= level.max);
  return match ? match.name : 'Sin nivel';
};

const getRebateForTotal = (total) => {
  const value = Number(total || 0);
  if (value <= 0) return 0;
  const match = LEVELS.find((level) => value >= level.min && value <= level.max);
  return match ? match.rebate : 0;
};

const renderRewardsPortal = ({
  cedula = '',
  clientName = '',
  clientInfo = null,
  points = null,
  total = null,
  error = null,
  rewards = [],
  editReward = null,
  gspCareActive = false,
  gspCareList = [],
  section = 'inicio',
} = {}) => {
  const rewardsList = rewards;
  const activeReward = editReward || {
    id: '',
    title: '',
    description: '',
    points: '',
    value: '',
    image: '',
  };
  const steps = [
    {
      title: 'Acumula',
      description: 'Compra productos y acumula cashback por cada pedido.',
    },
    {
      title: 'Elige',
      description: 'Selecciona el beneficio que deseas redimir.',
    },
    { title: 'Canjea', description: 'Solicita el canje y recibe confirmación.' },
  ];
  const activity = [
    { title: 'Canje $500.000 cashback', points: '-$500.000', date: '21 ene 2026' },
    { title: 'Canje bono gasolina', points: '-$80.000', date: '10 ene 2026' },
  ];
  const termsText =
    'Rewards GSP: Acumula cashback en cada compra y redímelo para tus próximas ' +
    'compras en GSP. El cashback no es dinero en efectivo, no es transferible ' +
    'y no aplica para pagos de cartera ni abonos a cuenta. El cashback es válido ' +
    'únicamente para compras futuras de productos disponibles y bajo las ' +
    'condiciones y vigencia informadas. Al participar en Rewards GSP aceptas ' +
    'estos términos.';

  const totalValue =
    total === null ? '—' : `$${formatNumber(total)}`;
  const levelValue = total === null ? '—' : getLevelForTotal(total);
  const rebateValue = total === null ? '—' : getRebateForTotal(total);
  const cashbackValue =
    total === null ? '—' : `$${formatNumber((total * rebateValue) / 100)}`;
  const progressValue =
    total === null ? 0 : Math.min(1, Number(total) / BASE_LEVEL_GOAL);
  const progressPercent = Math.round(progressValue * 100);
  const remainingForRebate =
    total === null ? '—' : `$${formatNumber(Math.max(0, BASE_LEVEL_GOAL - total))}`;
  const baseLevelCashback = `$${formatNumber(
    Math.round(BASE_LEVEL_GOAL * (BASE_LEVEL_REBATE / 100))
  )}`;
  const careStatus = gspCareActive ? 'Activo' : 'No activo';
  const normalizedSection = String(section || 'inicio').trim() || 'inicio';
  const showDashboard = normalizedSection === 'inicio';
  const showClientes = normalizedSection === 'clientes';
  const showPremios = normalizedSection === 'premios';
  const showCare = normalizedSection === 'gsp-care';
  const rewardsCount = rewardsList.length;
  const careCount = gspCareList.length;
  const displayName = clientInfo?.name || clientName;

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
      header {
        background: #0f1422;
        border-bottom: 1px solid #1f2736;
      }
      .topbar {
        max-width: 1080px;
        margin: 0 auto;
        padding: 16px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }
      .logo {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .logo img {
        width: 140px;
        height: 40px;
        object-fit: contain;
      }
      .nav {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
      }
      .nav a {
        color: var(--muted);
        text-decoration: none;
        font-size: 14px;
      }
      .nav a:hover {
        color: var(--text);
      }
      .container {
        max-width: 1080px;
        margin: 0 auto;
        padding: 32px 20px 60px;
        display: flex;
        flex-direction: column;
        gap: 20px;
      }
      .layout {
        display: grid;
        grid-template-columns: 220px 1fr;
        gap: 20px;
        align-items: start;
      }
      .sidebar {
        background: var(--card);
        border-radius: 18px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        position: sticky;
        top: 16px;
      }
      .sidebar a {
        color: var(--muted);
        text-decoration: none;
        font-size: 14px;
        padding: 10px 12px;
        border-radius: 12px;
      }
      .sidebar a:hover {
        background: #0f1422;
        color: var(--text);
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
      .section-title {
        margin: 0 0 6px 0;
        font-size: 20px;
      }
      .section-subtitle {
        margin: 0 0 16px 0;
        color: var(--muted);
        font-size: 13px;
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
      .reward-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 6px;
      }
      .btn-secondary {
        background: transparent;
        border: 1px solid #2a3347;
        color: var(--text);
      }
      .form-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
      }
      .form-grid input {
        width: 100%;
      }
      .reward-image {
        width: 100%;
        height: 120px;
        border-radius: 12px;
        object-fit: cover;
        margin-bottom: 8px;
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
    <header>
      <div class="topbar">
        <div class="logo">
          <img src="https://gsp.com.co/wp-content/uploads/2026/01/Identificador-GSP_LOGO_3.png" alt="GSP" />
        </div>
        <nav class="nav">
          <a href="/admin/rewards?section=inicio">Inicio</a>
          <a href="/admin/rewards?section=clientes">Buscar cliente</a>
          <a href="/admin/rewards?section=premios">Premios</a>
          <a href="/admin/rewards?section=gsp-care">GSP Care</a>
          <a href="/admin/logout">Cerrar sesión</a>
        </nav>
      </div>
    </header>
    <div class="container">
      <div class="layout">
        <aside class="sidebar">
          <strong>Menú</strong>
          <a href="/admin/rewards?section=inicio">Dashboard</a>
          <a href="/admin/rewards?section=clientes">Buscar cliente</a>
          <a href="/admin/rewards?section=premios">Premios</a>
          <a href="/admin/rewards?section=gsp-care">GSP Care</a>
          <a href="/admin/logout">Cerrar sesión</a>
        </aside>

        <main style="display:flex; flex-direction:column; gap:20px;">
          ${
            showDashboard
              ? `<div id="inicio" class="card">
            <h1>Dashboard GSPRewards</h1>
            <p class="section-subtitle">
              Consulta puntos por cliente y administra premios disponibles.
            </p>
            <div class="totals">
              <div class="item">
                <span>Cashback estimado</span>
                <strong>${cashbackValue}</strong>
              </div>
              <div class="item">
                <span>Compras mensuales (CxC)</span>
                <strong>${totalValue}</strong>
              </div>
              <div class="item">
                <span>Nivel</span>
                <strong>${levelValue}</strong>
              </div>
              <div class="item">
                <span>Rebate</span>
                <strong>${rebateValue === '—' ? '—' : `${rebateValue}%`}</strong>
              </div>
              <div class="item">
                <span>GSP Care</span>
                <strong>${careStatus}</strong>
              </div>
            </div>
          </div>
          <div class="card">
            <h2 class="section-title">Resumen rápido</h2>
            <p class="section-subtitle">Estado general del portal.</p>
            <div class="totals">
              <div class="item">
                <span>Premios activos</span>
                <strong>${rewardsCount}</strong>
              </div>
              <div class="item">
                <span>Membresías GSP Care</span>
                <strong>${careCount}</strong>
              </div>
              <div class="item">
                <span>Última búsqueda</span>
                <strong>${cedula ? escapeHtml(cedula) : '—'}</strong>
              </div>
            </div>
          </div>`
              : ''
          }

          ${
            showClientes
              ? `<div id="clientes" class="card">
            <h2 class="section-title">Buscar cliente</h2>
            <p class="section-subtitle">
              Ingresa NIT o cédula para consultar el saldo.
            </p>
            <form class="form" method="get" action="/admin/rewards">
              <input type="hidden" name="section" value="clientes" />
              <input type="text" name="cedula" placeholder="NIT o cédula" value="${escapeHtml(
                cedula
              )}" />
              <button type="submit">Consultar</button>
            </form>
            ${
              cedula
                ? `<div class="label" style="margin-top:12px;">NIT/Cédula: <strong>${escapeHtml(
                    cedula
                  )}</strong></div>`
                : ''
            }
            ${
              displayName
                ? `<div class="label">Nombre: <strong>${escapeHtml(
                    displayName
                  )}</strong></div>`
                : `<div class="label">Nombre: <strong>—</strong></div>`
            }
            ${
              cedula && !clientInfo
                ? '<div class="label">Cliente no encontrado en ListadoClientes.</div>'
                : ''
            }
            ${
              clientInfo?.seller
                ? `<div class="label">Vendedor: <strong>${escapeHtml(
                    clientInfo.seller
                  )}</strong></div>`
                : ''
            }
            ${
              clientInfo?.email
                ? `<div class="label">Correo: <strong>${escapeHtml(
                    clientInfo.email
                  )}</strong></div>`
                : ''
            }
            ${
              clientInfo?.phone
                ? `<div class="label">Teléfono: <strong>${escapeHtml(
                    clientInfo.phone
                  )}</strong></div>`
                : ''
            }
            ${
              clientInfo?.city
                ? `<div class="label">Ciudad: <strong>${escapeHtml(
                    clientInfo.city
                  )}</strong></div>`
                : ''
            }
            ${
              clientInfo?.address
                ? `<div class="label">Dirección: <strong>${escapeHtml(
                    clientInfo.address
                  )}</strong></div>`
                : ''
            }
            ${
              clientInfo?.cupo
                ? `<div class="label">Cupo: <strong>${formatNumber(
                    clientInfo.cupo
                  )}</strong></div>`
                : ''
            }
            ${
              clientInfo?.plazo
                ? `<div class="label">Plazo: <strong>${escapeHtml(
                    clientInfo.plazo
                  )}</strong></div>`
                : ''
            }
            ${
              cedula
                ? `<div class="label">Valor compras: <strong>${formatNumber(
                    total ?? 0
                  )}</strong></div>`
                : ''
            }
            ${
              error
                ? `<div class="alert">Error: ${escapeHtml(error)}</div>`
                : ''
            }
          </div>`
              : ''
          }

          ${
            showDashboard
              ? `<div class="card">
            <div class="pill"><span class="dot"></span>Nivel ${levelValue}</div>
            <div class="value">${cashbackValue}</div>
            <div class="muted">Rebate ${rebateValue}% · Compras mensuales antes de IVA</div>
            <div class="muted">Falta ${remainingForRebate} para recibir cashback</div>
            <div class="muted">Al cumplir nivel 1 ganarías ${baseLevelCashback} de cashback</div>
            <div class="muted">Avance nivel 1: ${progressPercent}% · Meta $${formatNumber(
              BASE_LEVEL_GOAL
            )}</div>
          </div>`
              : ''
          }

          ${
            showPremios
              ? `<div id="premios" class="card">
            <h2 class="section-title">Premios para redimir</h2>
            <p class="section-subtitle">
              Administra el catálogo de premios que los clientes pueden canjear.
            </p>
            <form class="form-grid" method="post" action="/admin/rewards/save">
              <input type="hidden" name="section" value="premios" />
              <input type="hidden" name="id" value="${escapeHtml(activeReward.id)}" />
              <input type="text" name="title" placeholder="Nombre del premio" required value="${escapeHtml(
                activeReward.title
              )}" />
              <input type="text" name="description" placeholder="Descripción" value="${escapeHtml(
                activeReward.description
              )}" />
              <input type="text" name="points" placeholder="Puntos (ej. 2000)" required value="${escapeHtml(
                activeReward.points
              )}" />
              <input type="text" name="value" placeholder="Valor (ej. $20.000)" value="${escapeHtml(
                activeReward.value
              )}" />
              <input type="text" name="image" placeholder="URL de imagen" value="${escapeHtml(
                activeReward.image
              )}" />
              <button type="submit">${activeReward.id ? 'Guardar cambios' : 'Agregar premio'}</button>
              ${
                activeReward.id
                  ? '<a href="/admin/rewards#premios" class="btn-secondary" style="text-decoration:none;display:inline-flex;align-items:center;">Cancelar</a>'
                  : ''
              }
            </form>
            <div class="grid" style="margin-top:16px;">
              ${rewardsList
                .map(
                  (reward) => `<div class="subcard">
                    <img class="reward-image" src="${reward.image}" alt="${escapeHtml(
                      reward.title
                    )}" />
                    <h3>${reward.title}</h3>
                    <div class="label">${reward.description || ''}</div>
                    <div class="label">${formatNumber(reward.points)} pts · ${
                      reward.value || ''
                    }</div>
                    <div class="reward-actions">
                      <a href="/admin/rewards?section=premios&editId=${reward.id}" class="btn-secondary" style="text-decoration:none;display:inline-flex;align-items:center;padding:8px 12px;">Editar</a>
                      <form method="post" action="/admin/rewards/delete">
                        <input type="hidden" name="section" value="premios" />
                        <input type="hidden" name="id" value="${reward.id}" />
                        <button type="submit" class="btn-secondary">Eliminar</button>
                      </form>
                    </div>
                  </div>`
                )
                .join('')}
            </div>
          </div>`
              : ''
          }

      ${
        showDashboard
          ? `<div class="card">
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
      </div>`
          : ''
      }

      ${
        showDashboard
          ? `<div class="card">
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
      </div>`
          : ''
      }

      ${
        showDashboard
          ? `<div class="card">
        <h2>T&C</h2>
        <div class="muted">${termsText}</div>
      </div>`
          : ''
      }

      ${
        showCare
          ? `<div id="gsp-care" class="card">
        <h2 class="section-title">GSP Care</h2>
        <p class="section-subtitle">
          Activa o desactiva la membresía para NITs que compren GSP Care.
        </p>
        <form class="form" method="post" action="/admin/gspcare/save">
          <input type="hidden" name="section" value="gsp-care" />
          <input type="text" name="cedula" placeholder="NIT o cédula" required />
          <input type="text" name="fecha" placeholder="Fecha activación (YYYY-MM-DD)" />
          <button type="submit">Activar</button>
        </form>
        <div class="grid" style="margin-top:16px;">
          ${
            gspCareList.length > 0
              ? gspCareList
                  .map(
                    (item) => `<div class="subcard">
                    <h3>${escapeHtml(item.cedula)}</h3>
                    <div class="label">Activado: ${escapeHtml(
                      item.activatedAt || '—'
                    )}</div>
                    <div class="reward-actions">
                      <form method="post" action="/admin/gspcare/delete">
                        <input type="hidden" name="section" value="gsp-care" />
                        <input type="hidden" name="cedula" value="${escapeHtml(
                          item.cedula
                        )}" />
                        <button type="submit" class="btn-secondary">Desactivar</button>
                      </form>
                    </div>
                  </div>`
                  )
                  .join('')
              : '<div class="alert">No hay membresías activas.</div>'
          }
        </div>
      </div>`
          : ''
      }
        </main>
      </div>
    </div>
  </body>
</html>`;
};

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:', 'https:'],
      },
    },
  })
);
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const defaultRewards = [
  {
    id: 'saldo',
    title: 'Dinero en saldo',
    description: 'Convierte puntos en saldo para tus próximas compras.',
    points: '2000',
    value: '$20.000',
    image:
      'https://gsp.com.co/wp-content/uploads/2026/01/Identificador-GSP_LOGO_3.png',
  },
  {
    id: 'tarjeta',
    title: 'Tarjeta regalo',
    description: 'Canjea por tarjetas de regalo para tu equipo.',
    points: '5000',
    value: '$60.000',
    image:
      'https://images.unsplash.com/photo-1512909006721-3d6018887383?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'accesorios',
    title: 'Accesorios premium',
    description: 'Elige accesorios seleccionados en catálogo.',
    points: '3500',
    value: 'Item',
    image:
      'https://images.unsplash.com/photo-1518544889280-8f26f10db6c3?auto=format&fit=crop&w=800&q=80',
  },
];

const loadRewards = () => {
  try {
    const raw = fs.readFileSync(rewardsPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('No se pudo leer rewards.json:', error?.message || error);
  }
  return defaultRewards;
};

const saveRewards = (rewards) => {
  try {
    fs.mkdirSync(path.dirname(rewardsPath), { recursive: true });
    fs.writeFileSync(rewardsPath, JSON.stringify(rewards, null, 2));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('No se pudo guardar rewards.json:', error?.message || error);
  }
};

const loadGspCare = () => {
  try {
    const raw = fs.readFileSync(gspCarePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          if (typeof item === 'string') {
            return { cedula: normalizeId(item), activatedAt: null };
          }
          if (item && typeof item === 'object') {
            return {
              cedula: normalizeId(item.cedula || item.id || ''),
              activatedAt: String(item.activatedAt || '').trim() || null,
            };
          }
          return null;
        })
        .filter(Boolean);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('No se pudo leer gspcare.json:', error?.message || error);
  }
  return [];
};

const saveGspCare = (items) => {
  try {
    fs.mkdirSync(path.dirname(gspCarePath), { recursive: true });
    fs.writeFileSync(gspCarePath, JSON.stringify(items, null, 2));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('No se pudo guardar gspcare.json:', error?.message || error);
  }
};

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

    const fixedUser = process.env.ADMIN_PORTAL_USER;
    const fixedPass = process.env.ADMIN_PORTAL_PASS;
    if (fixedUser && fixedPass) {
      if (
        credentials.username === fixedUser &&
        credentials.password === fixedPass
      ) {
        return next();
      }
      res.setHeader('WWW-Authenticate', 'Basic realm="GSP Admin"');
      return res.status(401).send('Credenciales inválidas.');
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

app.get('/admin/logout', (_req, res) => {
  res.setHeader('WWW-Authenticate', 'Basic realm="GSP Admin"');
  return res.status(401).send('Sesión cerrada.');
});

app.get('/admin/rewards', adminAuth, async (req, res) => {
  const cedula = String(req.query.cedula || '').trim();
  const editId = String(req.query.editId || '').trim();
  const section = String(req.query.section || 'inicio').trim() || 'inicio';
  const rewards = loadRewards();
  const gspCareList = loadGspCare();
  const gspCareActive = cedula
    ? gspCareList.some((item) => item.cedula === normalizeId(cedula))
    : false;
  const editReward = editId
    ? rewards.find((reward) => String(reward.id) === editId) || null
    : null;
  if (!cedula) {
    return res.send(
      renderRewardsPortal({
        rewards,
        editReward,
        gspCareList,
        gspCareActive,
        section,
      })
    );
  }

  try {
    const [facturasData, clientesData] = await Promise.all([
      cxc.detalleFacturasPedido(buildCxcDetalleParams({ cedula })),
      cxc
        .listadoClientes({ filas: 500, pagina: 1 })
        .catch(() => null),
    ]);
    const clientesPayload = clientesData
      ? parseMaybeJson(
          clientesData.result ?? clientesData.response ?? clientesData.parsed ?? {}
        )
      : null;
    const clientInfo = clientesPayload
      ? buildClientInfo(clientesPayload, cedula)
      : null;
    const data = facturasData;
    if (isCxcFunctionInactive(data?.xml)) {
      return res.send(
        renderRewardsPortal({
          cedula,
          error:
            'CxC respondió "Función no activa" para DetalleFacturasPedido. Solicita al proveedor habilitar el método.',
          rewards,
          editReward,
          gspCareList,
          gspCareActive,
          clientInfo,
          section,
        })
      );
    }
    const payload = parseMaybeJson(
      data.result ?? data.response ?? data.parsed ?? {}
    );
    const name = findValueByKeys(payload, CLIENT_NAME_KEYS);
    const total = sumTotalsForKey(payload, 'total');
    const points = CXC_POINTS_DIVISOR > 0 ? Math.floor(total / CXC_POINTS_DIVISOR) : 0;
    return res.send(
      renderRewardsPortal({
        cedula,
        clientName: name,
        clientInfo,
        total,
        points,
        rewards,
        editReward,
        gspCareList,
        gspCareActive,
        section,
      })
    );
  } catch (error) {
    return res.send(
      renderRewardsPortal({
        cedula,
        error: error?.response?.data || error?.message || 'No se pudo calcular',
        rewards,
        editReward,
        gspCareList,
        gspCareActive,
        section,
      })
    );
  }
});

app.post('/admin/rewards/save', adminAuth, (req, res) => {
  const { id, title, description, points, value, image, section } =
    req.body || {};
  if (!title || !points) {
    return res.redirect('/admin/rewards?section=premios');
  }
  const rewards = loadRewards();
  const rewardId = id || `${Date.now()}`;
  const payload = {
    id: rewardId,
    title: String(title).trim(),
    description: String(description || '').trim(),
    points: String(points).trim(),
    value: String(value || '').trim(),
    image:
      String(image || '').trim() ||
      'https://gsp.com.co/wp-content/uploads/2026/01/Identificador-GSP_LOGO_3.png',
  };
  const index = rewards.findIndex((item) => item.id === rewardId);
  if (index >= 0) {
    rewards[index] = payload;
  } else {
    rewards.unshift(payload);
  }
  saveRewards(rewards);
  const targetSection = section || 'premios';
  return res.redirect(`/admin/rewards?section=${encodeURIComponent(targetSection)}`);
});

app.post('/admin/rewards/delete', adminAuth, (req, res) => {
  const { id, section } = req.body || {};
  if (!id) {
    return res.redirect('/admin/rewards?section=premios');
  }
  const rewards = loadRewards();
  const filtered = rewards.filter((reward) => reward.id !== id);
  saveRewards(filtered);
  const targetSection = section || 'premios';
  return res.redirect(`/admin/rewards?section=${encodeURIComponent(targetSection)}`);
});

app.post('/admin/gspcare/save', adminAuth, (req, res) => {
  const { cedula, fecha, section } = req.body || {};
  const normalized = normalizeId(cedula);
  if (!normalized) {
    return res.redirect('/admin/rewards?section=gsp-care');
  }
  const current = loadGspCare();
  const existing = current.find((item) => item.cedula === normalized);
  if (!existing) {
    const today = new Date().toISOString().slice(0, 10);
    current.unshift({
      cedula: normalized,
      activatedAt: String(fecha || '').trim() || today,
    });
    saveGspCare(current);
  }
  const targetSection = section || 'gsp-care';
  return res.redirect(`/admin/rewards?section=${encodeURIComponent(targetSection)}`);
});

app.post('/admin/gspcare/delete', adminAuth, (req, res) => {
  const { cedula, section } = req.body || {};
  const normalized = normalizeId(cedula);
  if (!normalized) {
    return res.redirect('/admin/rewards?section=gsp-care');
  }
  const current = loadGspCare();
  const filtered = current.filter((item) => item.cedula !== normalized);
  saveGspCare(filtered);
  const targetSection = section || 'gsp-care';
  return res.redirect(`/admin/rewards?section=${encodeURIComponent(targetSection)}`);
});

app.get('/api/rewards', (_req, res) => {
  const rewards = loadRewards();
  return res.json({ rewards });
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
    let profile = null;
    let customer = null;
    try {
      if (data?.token) {
        profile = await woo.getWpUserMe(data.token);
      }
    } catch (_error) {
      profile = null;
    }
    try {
      customer = await woo.findCustomerByEmail(email);
    } catch (_error) {
      customer = null;
    }
    const billingFirst = customer?.billing?.first_name || '';
    const billingLast = customer?.billing?.last_name || '';
    const firstName = billingFirst || profile?.first_name || '';
    const lastName = billingLast || profile?.last_name || '';
    const fullName =
      `${firstName} ${lastName}`.trim() ||
      profile?.name ||
      data?.user_display_name ||
      '';
    return res.json({
      token: data?.token,
      user: {
        id: data?.user_id,
        email: data?.user_email,
        name: data?.user_display_name,
        firstName,
        lastName,
        fullName,
        nicename: data?.user_nicename,
      },
    });
  } catch (error) {
    return res.status(401).json({
      error: 'Credenciales inválidas',
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
    if (cedula) {
      Object.assign(callParams, buildCxcDetalleParams({ cedula, fecha }), callParams);
    }

    const data = await cxc.detalleFacturasPedido(callParams);
    if (debug) {
      return res.json(data);
    }
    if (isCxcFunctionInactive(data?.xml)) {
      return res.status(502).json({
        error:
          'CxC respondió "Función no activa" para DetalleFacturasPedido. Solicita al proveedor habilitar el método.',
      });
    }

    const payload = parseMaybeJson(
      data.result ?? data.response ?? data.parsed ?? {}
    );
    const name = findValueByKeys(payload, [
      'nombre',
      'nombrecliente',
      'nombre_cliente',
      'nombre_completo',
      'razonsocial',
      'razon_social',
      'cliente',
      'strcli_nombre',
      'strpar_nombre',
      'strcli_razon',
      'strpar_razonsocial',
    ]);
    const idValue = findValueByKeys(payload, [
      'cedula',
      'nit',
      'documento',
      'identificacion',
      'strpar_cedula',
      'strpar_nit',
    ]);
    const keyToUse = totalKey || 'total';
    const total = sumTotalsForKey(payload, keyToUse);
    const divisorValue = Number(divisor || CXC_POINTS_DIVISOR || 10000);
    const points = divisorValue > 0 ? Math.floor(total / divisorValue) : 0;
    const level = getLevelForTotal(total);
    const rebate = getRebateForTotal(total);
    const cashback = total ? Math.round((total * rebate) / 100) : 0;
    const gspCareActive = cedula
      ? loadGspCare().some((item) => item.cedula === normalizeId(cedula))
      : false;

    return res.json({
      nit: normalizeId(cedula || idValue),
      name,
      total,
      cashback,
      points,
      level,
      rebate,
      gspCare: gspCareActive,
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
