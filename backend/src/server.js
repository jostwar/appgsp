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
const DEFAULT_CXC_VENDEDOR = String(process.env.CXC_DEFAULT_VENDEDOR || '').trim();
const CXC_TOKEN = process.env.CXC_TOKEN;
const CXC_EMPRESA = process.env.CXC_EMPRESA;
const CXC_VENTAS_CHUNK_DAYS = Number(process.env.CXC_VENTAS_CHUNK_DAYS || 7);
const CXC_VENTAS_START_YEAR = Number(process.env.CXC_VENTAS_START_YEAR || 2026);
const CXC_VENTAS_MAX_MONTHS = Number(process.env.CXC_VENTAS_MAX_MONTHS || 12);
const CXC_VENTAS_CACHE_MINUTES = Number(process.env.CXC_VENTAS_CACHE_MINUTES || 15);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rewardsPath = path.resolve(__dirname, '../data', 'rewards.json');
const gspCarePath = path.resolve(__dirname, '../data', 'gspcare.json');
const clientsCachePath = path.resolve(__dirname, '../data', 'clients-cache.json');
const CLIENTS_CACHE_REFRESH_HOURS = Number(
  process.env.CXC_CLIENTS_REFRESH_HOURS || 24
);
const CLIENTS_CACHE_MAX_PAGES = Number(process.env.CXC_CLIENTS_MAX_PAGES || 50);

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

const parseJsonish = (value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  const tryParse = (text) => {
    try {
      return JSON.parse(text);
    } catch (_error) {
      return null;
    }
  };
  let parsed = tryParse(trimmed);
  if (parsed && typeof parsed === 'string') {
    const nested = tryParse(parsed);
    if (nested !== null) return nested;
  }
  if (parsed !== null) return parsed;
  const firstBracket = trimmed.indexOf('[');
  const firstBrace = trimmed.indexOf('{');
  const start =
    firstBracket === -1
      ? firstBrace
      : firstBrace === -1
        ? firstBracket
        : Math.min(firstBracket, firstBrace);
  const lastBracket = trimmed.lastIndexOf(']');
  const lastBrace = trimmed.lastIndexOf('}');
  const end = Math.max(lastBracket, lastBrace);
  if (start >= 0 && end > start) {
    const fragment = trimmed.slice(start, end + 1);
    parsed = tryParse(fragment);
    if (parsed && typeof parsed === 'string') {
      const nested = tryParse(parsed);
      if (nested !== null) return nested;
    }
    if (parsed !== null) return parsed;
  }
  return value;
};

const extractJsonPrefix = (xml) => {
  if (typeof xml !== 'string') return null;
  const markerIndex = xml.indexOf('<?xml');
  const prefix = markerIndex >= 0 ? xml.slice(0, markerIndex) : xml;
  const trimmed = prefix.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null;
  }
  return parseJsonish(trimmed);
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
  'cli_cedula',
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
  'cli_nombre',
  'strcli_nombre',
  'strpar_nombre',
  'strcli_razon',
  'strpar_razonsocial',
];
const CLIENT_EMAIL_KEYS = [
  'correo',
  'email',
  'correo_electronico',
  'mail',
  'cli_email',
];
const CLIENT_PHONE_KEYS = [
  'telefono',
  'tel',
  'celular',
  'movil',
  'whatsapp',
  'cli_telefo',
  'cli_telcel',
];
const CLIENT_CITY_KEYS = ['ciudad', 'municipio', 'poblacion', 'cli_ciudad'];
const CLIENT_ADDRESS_KEYS = [
  'direccion',
  'dirección',
  'address',
  'cli_direcc',
];
const CLIENT_SELLER_KEYS = [
  'vendedor',
  'asesor',
  'strpar_vended',
  'strcli_vendedor',
  'cli_vended',
];
const CLIENT_CUPO_KEYS = [
  'cupo',
  'credito',
  'creditolimit',
  'cupo_credito',
  'cli_cupcre',
  'cli_cupcred',
];
const CLIENT_PLAZO_KEYS = ['plazo', 'dias_credito', 'dias', 'plazodias'];
const CLIENT_BIRTH_KEYS = ['cli_fecnac', 'fecha_nacimiento', 'fecnac'];
const CARTERA_SELLER_KEYS = [
  'vendedor',
  'strpar_vended',
  'strpar_vendedor',
  'strcli_vendedor',
  'cli_vended',
  'cli_nomven',
  'vendedor_asignado',
  'asesor',
];

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
  const normalizedValue = normalizeId(value);
  if (!normalizedValue) return false;
  if (normalizedValue === target) return true;
  const diff = Math.abs(normalizedValue.length - target.length);
  if (diff > 1) return false;
  return normalizedValue.startsWith(target) || target.startsWith(normalizedValue);
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
    birthDate: findValueByKeys(match, CLIENT_BIRTH_KEYS),
  };
};

const extractPagination = (data) => {
  if (!data) return { total: 0, pages: 1 };
  const candidate = Array.isArray(data) ? data[0] : data;
  const total = Number(candidate?.REGISTROS || candidate?.registros || 0);
  const pages = Number(candidate?.PAGINAS || candidate?.paginas || 1);
  return {
    total: Number.isFinite(total) ? total : 0,
    pages: Number.isFinite(pages) && pages > 0 ? pages : 1,
  };
};

const fetchListadoClientes = async ({ pagina, vendedor }) => {
  const clientesData = await cxc
    .listadoClientes({
      filas: 2000,
      pagina,
      fecha: formatDateTime(new Date()),
      vendedor,
    })
    .catch(() => null);
  const clientesPayload = clientesData
    ? parseMaybeJson(
        clientesData.result ?? clientesData.response ?? clientesData.parsed ?? {}
      )
    : null;
  const clientesJson = extractJsonPrefix(clientesData?.xml);
  const clientesText = parseJsonish(clientesData?.parsed?.['#text']);
  const data =
    (clientesPayload && Object.keys(clientesPayload || {}).length > 0
      ? clientesPayload
      : null) ||
    clientesJson ||
    clientesText;
  return {
    data,
    meta: extractPagination(data),
  };
};

const findClientInfo = async ({ cedula, vendedor }) => {
  const normalized = normalizeId(cedula);
  if (normalized && clientsCache.clients[normalized]) {
    return {
      info: clientsCache.clients[normalized],
      meta: { total: Object.keys(clientsCache.clients).length, pages: 1 },
      pagesScanned: 0,
      vendedor: 'cache',
    };
  }
  const firstPage = await fetchListadoClientes({ pagina: 1, vendedor });
  let clientInfo = firstPage.data ? buildClientInfo(firstPage.data, cedula) : null;
  let pagesScanned = 1;
  const baseMeta = firstPage.meta;
  if (clientInfo) {
    return { info: clientInfo, meta: baseMeta, pagesScanned, vendedor };
  }

  if (vendedor) {
    return { info: null, meta: baseMeta, pagesScanned, vendedor };
  }

  const maxPages = Math.min(baseMeta.pages, 20);
  for (let page = 2; page <= maxPages; page += 1) {
    const pageData = await fetchListadoClientes({ pagina: page, vendedor: '' });
    pagesScanned = page;
    clientInfo = pageData.data ? buildClientInfo(pageData.data, cedula) : null;
    if (clientInfo) {
      return {
        info: clientInfo,
        meta: pageData.meta,
        pagesScanned,
        vendedor: '',
      };
    }
  }
  return { info: null, meta: baseMeta, pagesScanned, vendedor: '' };
};

const findSellerFromCartera = async ({ cedula }) => {
  if (!cedula) return '';
  const data = await cxc
    .estadoCartera({ fecha: formatDateTime(new Date()), cedula })
    .catch(() => null);
  const payload = data
    ? parseMaybeJson(data.result ?? data.response ?? data.parsed ?? {})
    : null;
  const seller = findValueByKeys(payload, CARTERA_SELLER_KEYS);
  return String(seller || '').trim();
};

const getWooCustomerSummary = async (cedula) => {
  if (!cedula) return null;
  try {
    const customer = await woo.findCustomerByCedula(cedula, {
      perPage: 50,
      maxPages: 5,
    });
    if (!customer) {
      return { status: 'No registrado', customer: null };
    }
    const email = customer?.email || '';
    const billingFirst = customer?.billing?.first_name || '';
    const billingLast = customer?.billing?.last_name || '';
    const fullName = `${billingFirst} ${billingLast}`.trim() || customer?.name || '';
    return {
      status: 'Registrado',
      customer: {
        id: customer?.id,
        email,
        name: fullName,
      },
    };
  } catch (_error) {
    return { status: 'No disponible', customer: null };
  }
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
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number.isNaN(number) ? 0 : number);
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

const formatDateOnly = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateLabel = (value) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  }).format(parsed);
};

const formatMonthLabel = (date) => {
  const monthNames = [
    'Ene',
    'Feb',
    'Mar',
    'Abr',
    'May',
    'Jun',
    'Jul',
    'Ago',
    'Sep',
    'Oct',
    'Nov',
    'Dic',
  ];
  const month = monthNames[date.getMonth()] || '';
  return `${month} ${date.getFullYear()}`;
};

const isMaxJsonError = (error) => {
  const raw = String(error?.response?.data || error?.message || '').toLowerCase();
  return raw.includes('maxjsonlength');
};

const buildCache = () => {
  const store = new Map();
  const get = (key) => {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      store.delete(key);
      return null;
    }
    return entry.value;
  };
  const set = (key, value, ttlMs) => {
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
  };
  return { get, set };
};

const ventasCache = buildCache();

const buildCxcDetalleParams = ({ cedula, fecha } = {}) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = formatDateTime(fecha || startOfMonth);
  const to = formatDateTime(fecha || now, { endOfDay: true });
  const objPar_Objeto = JSON.stringify({
    strPar_Nit: cedula,
    strPar_Cedula: cedula,
  });
  return {
    strPar_Cedula: cedula,
    strPar_Nit: cedula,
    datPar_FecIni: from,
    datPar_FecFin: to,
    objPar_Objeto,
    intPar_TipPed: 1,
    strPar_NumPed: '',
    strPar_Vended: '',
    intPar_Filas: 200,
    intPar_Pagina: 1,
  };
};

const buildVentasParams = ({ cedula, fecha, from, to } = {}) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const rangeStart = from || fecha || startOfMonth;
  const rangeEnd = to || fecha || now;
  const fromValue = formatDateOnly(rangeStart);
  const toValue = formatDateOnly(rangeEnd);
  const objPar_Objeto = CXC_TOKEN;
  return {
    strPar_Empresa: CXC_EMPRESA,
    datPar_FecIni: fromValue,
    datPar_FecFin: toValue,
    objPar_Objeto,
  };
};

const splitDateRange = (start, end, chunkDays) => {
  const ranges = [];
  if (!start || !end) return ranges;
  const cursor = new Date(start);
  const last = new Date(end);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) return ranges;
  while (cursor <= last) {
    const rangeStart = new Date(cursor);
    const rangeEnd = new Date(cursor);
    rangeEnd.setDate(rangeEnd.getDate() + chunkDays - 1);
    if (rangeEnd > last) {
      rangeEnd.setTime(last.getTime());
    }
    ranges.push({ from: rangeStart, to: rangeEnd });
    cursor.setDate(cursor.getDate() + chunkDays);
  }
  return ranges;
};

const extractVentasPayload = (data) =>
  parseMaybeJson(data?.result ?? data?.response ?? data?.parsed ?? {});

const fetchVentasRange = async ({ cedula, from, to, chunkDays }) => {
  const payload = [];
  const ranges = splitDateRange(from, to, chunkDays);
  if (ranges.length === 0) return payload;

  for (const range of ranges) {
    try {
      const data = await cxc.generarInfoVentas(
        buildVentasParams({ cedula, from: range.from, to: range.to })
      );
      const parsed = extractVentasPayload(data);
      if (Array.isArray(parsed)) {
        payload.push(...parsed);
      } else if (parsed && typeof parsed === 'object') {
        payload.push(parsed);
      }
    } catch (error) {
      if (isMaxJsonError(error) && chunkDays > 1) {
        const fallback = await fetchVentasRange({
          cedula,
          from: range.from,
          to: range.to,
          chunkDays: 1,
        });
        payload.push(...fallback);
        continue;
      }
    }
  }

  return payload;
};

const fetchVentasPayload = async ({ cedula, fecha, from, to } = {}) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const rangeStart = from || fecha || startOfMonth;
  const rangeEnd = to || fecha || now;
  const chunkDays =
    Number.isFinite(CXC_VENTAS_CHUNK_DAYS) && CXC_VENTAS_CHUNK_DAYS > 0
      ? CXC_VENTAS_CHUNK_DAYS
      : 7;
  if (!rangeStart || !rangeEnd) return [];
  const cacheKey = [
    'ventas',
    normalizeId(cedula),
    formatDateOnly(rangeStart),
    formatDateOnly(rangeEnd),
    chunkDays,
  ].join('|');
  const cached = ventasCache.get(cacheKey);
  if (cached) return cached;
  const payload = await fetchVentasRange({
    cedula,
    from: rangeStart,
    to: rangeEnd,
    chunkDays,
  });
  const ttlMs = (Number.isFinite(CXC_VENTAS_CACHE_MINUTES)
    ? CXC_VENTAS_CACHE_MINUTES
    : 15) * 60 * 1000;
  ventasCache.set(cacheKey, payload, ttlMs);
  return payload;
};

const filterVentasPayload = (payload, cedula) => {
  const target = normalizeId(cedula);
  if (!target || !payload) return payload;

  const matchesItem = (item) => {
    if (!item || typeof item !== 'object') return false;
    const idValue = findValueByKeys(item, CLIENT_ID_KEYS);
    if (matchesCedulaValue(idValue, target)) return true;
    return Object.values(item).some((value) => matchesCedulaValue(value, target));
  };

  if (Array.isArray(payload)) {
    return payload.filter(matchesItem);
  }
  if (typeof payload === 'object') {
    return matchesItem(payload) ? payload : null;
  }
  return payload;
};

const getVentasTotal = (payload, totalKey) => {
  const primaryKey = totalKey || 'VALTOT';
  const primary = sumTotalsForKey(payload, primaryKey);
  if (primary > 0) return primary;
  if (primaryKey !== 'VALTOT') {
    const fallback = sumTotalsForKey(payload, 'VALTOT');
    if (fallback > 0) return fallback;
  }
  return sumTotalsForKey(payload, 'total');
};

const buildVentasMonthlySummary = async ({ cedula, startYear } = {}) => {
  if (!cedula) return { rows: [], updatedAt: null };
  const yearStart = Number.isFinite(startYear) ? startYear : CXC_VENTAS_START_YEAR;
  const now = new Date();
  const maxMonths =
    Number.isFinite(CXC_VENTAS_MAX_MONTHS) && CXC_VENTAS_MAX_MONTHS > 0
      ? CXC_VENTAS_MAX_MONTHS
      : 12;
  const startDate = new Date(yearStart, 0, 1);
  const endDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const maxStartDate = new Date(endDate);
  maxStartDate.setMonth(maxStartDate.getMonth() - (maxMonths - 1));
  if (maxStartDate > startDate) {
    startDate.setTime(maxStartDate.getTime());
  }
  const summaryKey = [
    'summary',
    normalizeId(cedula),
    startDate.getFullYear(),
    startDate.getMonth() + 1,
    endDate.getFullYear(),
    endDate.getMonth() + 1,
    maxMonths,
  ].join('|');
  const cached = ventasCache.get(summaryKey);
  if (cached) return cached;
  const rows = [];
  const cursor = new Date(startDate);

  while (cursor <= endDate) {
    const rangeStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const rangeEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const payload = await fetchVentasPayload({
      cedula,
      from: rangeStart,
      to: rangeEnd,
    });
    const filteredPayload = filterVentasPayload(payload, cedula);
    const total = getVentasTotal(filteredPayload || payload);
    const rebate = getRebateForTotal(total);
    const cashback = total ? Math.round((total * rebate) / 100) : 0;
    rows.push({
      year: rangeStart.getFullYear(),
      month: rangeStart.getMonth() + 1,
      label: formatMonthLabel(rangeStart),
      total,
      rebate,
      cashback,
      level: getLevelForTotal(total),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const ttlMs = (Number.isFinite(CXC_VENTAS_CACHE_MINUTES)
    ? CXC_VENTAS_CACHE_MINUTES
    : 15) * 60 * 1000;
  const payload = { rows, updatedAt: new Date().toISOString() };
  ventasCache.set(summaryKey, payload, ttlMs);
  return payload;
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
  vendedor = '',
  vendedorInput = '',
  defaultVendedor = '',
  clientName = '',
  clientInfo = null,
  clientSearch = null,
  wooSummary = null,
  points = null,
  total = null,
  error = null,
  monthlySummary = { rows: [], updatedAt: null },
  rewards = [],
  editReward = null,
  gspCareActive = false,
  gspCareList = [],
  section = 'inicio',
} = {}) => {
  const rewardsList = rewards;
  const monthlyRows = Array.isArray(monthlySummary?.rows) ? monthlySummary.rows : [];
  const monthlyUpdatedAt = monthlySummary?.updatedAt || null;
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
      .suggestions {
        background: #0f1422;
        border: 1px solid #2a3347;
        border-radius: 12px;
        padding: 6px;
        margin-top: 6px;
        max-height: 220px;
        overflow: auto;
      }
      .suggestion-item {
        padding: 8px 10px;
        border-radius: 10px;
        cursor: pointer;
        font-size: 13px;
      }
      .suggestion-item:hover {
        background: #111827;
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
      .client-details .label {
        margin-top: 6px;
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
      .table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      .table th,
      .table td {
        padding: 10px 12px;
        border-bottom: 1px solid #1f2937;
        text-align: left;
      }
      .table th {
        color: var(--muted);
        font-weight: 600;
      }
      .table tbody tr:hover {
        background: #0f1422;
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
              <input type="text" id="cedula-input" name="cedula" placeholder="NIT o cédula" autocomplete="off" value="${escapeHtml(
                cedula
              )}" />
              <input type="text" name="vendedor" placeholder="Vendedor (opcional)" value="${escapeHtml(
                vendedorInput || defaultVendedor || vendedor
              )}" />
              <button type="submit">Consultar</button>
            </form>
            <div id="cedula-suggestions" class="suggestions" style="display:none;"></div>
            ${
              !vendedorInput && defaultVendedor
                ? `<div class="muted">Usando vendedor por defecto: ${escapeHtml(
                    defaultVendedor
                  )}</div>`
                : ''
            }
            <div class="client-details">
              ${
                cedula
                  ? `<div class="label">NIT/Cédula: <strong>${escapeHtml(
                      cedula
                    )}</strong></div>`
                  : ''
              }
              ${
                !cedula
                  ? `<div class="label">NIT/Cédula: <strong>—</strong></div>
                     <div class="label">Nombre: <strong>—</strong></div>
                     <div class="label">Vendedor: <strong>—</strong></div>
                     <div class="label">Correo: <strong>—</strong></div>
                     <div class="label">Teléfono: <strong>—</strong></div>
                     <div class="label">Dirección: <strong>—</strong></div>
                     <div class="label">Cupo: <strong>—</strong></div>
                     <div class="label">Usuario e-commerce GSP: <strong>—</strong></div>`
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
                  ? `<div class="label">Cliente no encontrado en ListadoClientes.</div>
                     <div class="muted">Registros: ${
                       clientSearch?.meta?.total ?? '—'
                     } · Páginas: ${clientSearch?.meta?.pages ?? '—'} · Consultadas: ${
                       clientSearch?.pagesScanned ?? '—'
                     }${
                       clientSearch?.vendedor
                         ? ` · Vendedor: ${escapeHtml(clientSearch.vendedor)}`
                         : ''
                     }</div>`
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
                  ? `<div class="label">Cupo: <strong>$${formatNumber(
                      clientInfo.cupo
                    )}</strong></div>`
                  : ''
              }
              ${
                cedula
                  ? `<div class="label">Usuario e-commerce GSP: <strong>${
                      wooSummary?.status || '—'
                    }${
                      wooSummary?.customer?.email
                        ? ` · ${escapeHtml(wooSummary.customer.email)}`
                        : ''
                    }</strong></div>`
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
                clientInfo?.birthDate
                  ? `<div class="label">Nacimiento: <strong>${escapeHtml(
                      clientInfo.birthDate
                    )}</strong></div>`
                  : ''
              }
              <div class="label">Clientes actualizados: <strong>${formatDateLabel(
                clientsCache.updatedAt
              )}</strong></div>
              ${
                cedula
                  ? `<div class="label">Valor compras: <strong>$${formatNumber(
                      total ?? 0
                    )}</strong></div>`
                  : ''
              }
              ${
                cedula
                  ? `<div class="label">Nivel: <strong>${levelValue}</strong></div>`
                  : ''
              }
              ${
                cedula
                  ? `<div class="label">Rebate: <strong>${rebateValue}%</strong></div>`
                  : ''
              }
              ${
                cedula
                  ? `<div class="label">Cashback estimado: <strong>${cashbackValue}</strong></div>`
                  : ''
              }
              ${
                cedula
                  ? `<div class="label">GSP Care: <strong>${careStatus}</strong></div>`
                  : ''
              }
            </div>
            ${
              cedula
                ? `<div class="label" style="margin-top:16px;">Rebate y cashback mensual</div>
                   <div class="muted" style="margin-top:4px;">
                     Compras actualizadas: ${formatDateLabel(monthlyUpdatedAt)}
                   </div>
                   ${
                     monthlyRows.length
                       ? `<table class="table" style="margin-top:8px;">
                           <thead>
                             <tr>
                               <th>Mes</th>
                               <th>Compras</th>
                               <th>Nivel</th>
                               <th>Rebate</th>
                               <th>Cashback</th>
                             </tr>
                           </thead>
                           <tbody>
                             ${monthlyRows
                               .map(
                                 (row) =>
                                   `<tr>
                                     <td>${escapeHtml(row.label)}</td>
                                     <td>$${formatNumber(row.total || 0)}</td>
                                     <td>${escapeHtml(row.level)}</td>
                                     <td>${row.rebate || 0}%</td>
                                     <td>$${formatNumber(row.cashback || 0)}</td>
                                   </tr>`
                               )
                               .join('')}
                           </tbody>
                         </table>`
                       : `<div class="muted" style="margin-top:8px;">
                           Sin compras registradas desde ${CXC_VENTAS_START_YEAR}.
                         </div>`
                   }`
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
    <script>
      (function () {
        const input = document.getElementById('cedula-input');
        const list = document.getElementById('cedula-suggestions');
        if (!input || !list) return;
        let timer = null;
        const clearList = () => {
          list.innerHTML = '';
          list.style.display = 'none';
        };
        const renderList = (items) => {
          if (!items.length) {
            clearList();
            return;
          }
          list.innerHTML = items
            .map(
              (item) =>
                '<div class="suggestion-item" data-cedula="' +
                item.cedula +
                '">' +
                item.cedula +
                (item.name ? ' · ' + item.name : '') +
                '</div>'
            )
            .join('');
          list.style.display = 'block';
        };
        input.addEventListener('input', () => {
          const value = input.value.trim();
          if (timer) clearTimeout(timer);
          if (value.length < 3) {
            clearList();
            return;
          }
          timer = setTimeout(async () => {
            try {
              const res = await fetch('/api/cxc/clientes/suggest?q=' + encodeURIComponent(value));
              const data = await res.json();
              renderList(Array.isArray(data) ? data : []);
            } catch (_error) {
              clearList();
            }
          }, 200);
        });
        list.addEventListener('click', (event) => {
          const target = event.target.closest('.suggestion-item');
          if (!target) return;
          input.value = target.getAttribute('data-cedula') || '';
          clearList();
          input.focus();
        });
        document.addEventListener('click', (event) => {
          if (event.target === input || list.contains(event.target)) return;
          clearList();
        });
      })();
    </script>
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

const clientsCache = {
  updatedAt: null,
  clients: {},
};

const loadClientsCache = () => {
  try {
    const raw = fs.readFileSync(clientsCachePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      clientsCache.updatedAt = parsed.updatedAt || null;
      clientsCache.clients =
        parsed.clients && typeof parsed.clients === 'object' ? parsed.clients : {};
    }
  } catch (_error) {
    // ignore missing cache
  }
};

const saveClientsCache = () => {
  try {
    fs.mkdirSync(path.dirname(clientsCachePath), { recursive: true });
    fs.writeFileSync(
      clientsCachePath,
      JSON.stringify(
        {
          updatedAt: clientsCache.updatedAt,
          clients: clientsCache.clients,
        },
        null,
        2
      )
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('No se pudo guardar clients-cache.json:', error?.message || error);
  }
};

const buildClientInfoFromRecord = (record) => {
  if (!record || typeof record !== 'object') return null;
  const cedula = normalizeId(findValueByKeys(record, CLIENT_ID_KEYS));
  if (!cedula) return null;
  return {
    cedula,
    name: findValueByKeys(record, CLIENT_NAME_KEYS),
    email: findValueByKeys(record, CLIENT_EMAIL_KEYS),
    phone: findValueByKeys(record, CLIENT_PHONE_KEYS),
    city: findValueByKeys(record, CLIENT_CITY_KEYS),
    address: findValueByKeys(record, CLIENT_ADDRESS_KEYS),
    seller: findValueByKeys(record, CLIENT_SELLER_KEYS),
    cupo: findValueByKeys(record, CLIENT_CUPO_KEYS),
    plazo: findValueByKeys(record, CLIENT_PLAZO_KEYS),
    birthDate: findValueByKeys(record, CLIENT_BIRTH_KEYS),
  };
};

const collectClientRecords = (node, acc = []) => {
  if (!node) return acc;
  if (Array.isArray(node)) {
    node.forEach((item) => collectClientRecords(item, acc));
    return acc;
  }
  if (typeof node !== 'object') return acc;
  const candidate = buildClientInfoFromRecord(node);
  if (candidate) {
    acc.push(candidate);
  }
  Object.values(node).forEach((value) => {
    if (typeof value === 'object') {
      collectClientRecords(value, acc);
    }
  });
  return acc;
};

const refreshClientsCache = async () => {
  const now = new Date();
  const cache = {};
  const firstPage = await fetchListadoClientes({ pagina: 1, vendedor: '' });
  const totalPages = Math.min(firstPage.meta.pages, CLIENTS_CACHE_MAX_PAGES);
  const firstRecords = collectClientRecords(firstPage.data);
  firstRecords.forEach((item) => {
    cache[item.cedula] = item;
  });

  for (let page = 2; page <= totalPages; page += 1) {
    const pageData = await fetchListadoClientes({ pagina: page, vendedor: '' });
    const records = collectClientRecords(pageData.data);
    records.forEach((item) => {
      cache[item.cedula] = item;
    });
  }

  clientsCache.clients = cache;
  clientsCache.updatedAt = now.toISOString();
  saveClientsCache();
  return cache;
};

const ensureClientsCacheFresh = async () => {
  if (!clientsCache.updatedAt) {
    await refreshClientsCache();
    return;
  }
  const updated = new Date(clientsCache.updatedAt);
  if (Number.isNaN(updated.getTime())) {
    await refreshClientsCache();
    return;
  }
  const diffHours = (Date.now() - updated.getTime()) / (1000 * 60 * 60);
  if (diffHours >= CLIENTS_CACHE_REFRESH_HOURS) {
    await refreshClientsCache();
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

loadClientsCache();
ensureClientsCacheFresh().catch((error) => {
  // eslint-disable-next-line no-console
  console.warn('No se pudo refrescar clients cache:', error?.message || error);
});
setInterval(() => {
  ensureClientsCacheFresh().catch((error) => {
    // eslint-disable-next-line no-console
    console.warn('No se pudo refrescar clients cache:', error?.message || error);
  });
}, CLIENTS_CACHE_REFRESH_HOURS * 60 * 60 * 1000);

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
  const vendedorInput = String(req.query.vendedor || '').trim();
  const vendedor = vendedorInput || DEFAULT_CXC_VENDEDOR;
  const allowFallback =
    !vendedorInput || (DEFAULT_CXC_VENDEDOR && vendedorInput === DEFAULT_CXC_VENDEDOR);
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
        vendedor,
        vendedorInput,
        defaultVendedor: DEFAULT_CXC_VENDEDOR,
        section,
      })
    );
  }

  const [autoSeller, initialSearch, wooSummary] = await Promise.all([
    allowFallback ? findSellerFromCartera({ cedula }) : Promise.resolve(''),
    findClientInfo({ cedula, vendedor }),
    getWooCustomerSummary(cedula),
  ]);
  const autoSearch = autoSeller
    ? await findClientInfo({ cedula, vendedor: autoSeller })
    : null;
  const fallbackSearch = allowFallback
    ? await findClientInfo({ cedula, vendedor: '' })
    : null;
  const activeSearch = initialSearch?.info
    ? initialSearch
    : autoSearch?.info
      ? autoSearch
      : fallbackSearch || initialSearch;
  const clientInfo = activeSearch?.info || null;

  try {
    const payload = await fetchVentasPayload({ cedula });
    const filteredPayload = filterVentasPayload(payload, cedula);
    const name = findValueByKeys(filteredPayload || payload, CLIENT_NAME_KEYS);
    const total = getVentasTotal(filteredPayload || payload);
    const monthlySummary = await buildVentasMonthlySummary({ cedula });
    const points =
      CXC_POINTS_DIVISOR > 0 ? Math.floor(total / CXC_POINTS_DIVISOR) : 0;
    return res.send(
      renderRewardsPortal({
        cedula,
        clientName: name,
        clientInfo,
        clientSearch: activeSearch,
        wooSummary,
        total,
        points,
        monthlySummary,
        rewards,
        editReward,
        gspCareList,
        gspCareActive,
        vendedor,
        vendedorInput,
        defaultVendedor: DEFAULT_CXC_VENDEDOR,
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
        clientInfo,
        clientSearch: activeSearch,
        wooSummary,
        vendedor,
        vendedorInput,
        defaultVendedor: DEFAULT_CXC_VENDEDOR,
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
    const cedula = customer ? woo.getCustomerCedula(customer) : null;
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
        customerId: customer?.id || null,
        cedula: cedula || null,
      },
    });
  } catch (error) {
    return res.status(401).json({
      error: 'Credenciales inválidas',
      details: error?.response?.data || error?.message,
    });
  }
});

app.get('/api/woo/orders', async (req, res) => {
  try {
    const { cedula, customerId, page, perPage, email } = req.query;
    if (!cedula && !customerId && !email) {
      return res.status(400).json({
        error: 'cedula, customerId o email es requerido',
      });
    }
    let resolvedCustomerId = customerId ? Number(customerId) : null;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedCedula = String(cedula || '').replace(/\D+/g, '');
    const buildOrderKey = (order) => String(order?.id || '');
    const toList = (payload) => (Array.isArray(payload) ? payload : []);
    if (!resolvedCustomerId && cedula) {
      const customer = await woo.findCustomerByCedula(cedula, {
        perPage: 50,
        maxPages: 10,
      });
      if (!customer) {
        resolvedCustomerId = null;
      } else {
        resolvedCustomerId = customer.id;
      }
    }
    const orderPage = page ? Number(page) : 1;
    const orderPerPage = perPage ? Number(perPage) : 10;
    let orders = [];
    if (resolvedCustomerId) {
      orders = toList(
        await woo.listOrdersByCustomerId(resolvedCustomerId, {
          page: orderPage,
          perPage: orderPerPage,
        })
      );
    }

    const shouldSearchByEmail =
      normalizedEmail && (!resolvedCustomerId || orders.length === 0);
    if (shouldSearchByEmail) {
      const emailMatches = toList(
        await woo.listOrdersBySearch(normalizedEmail, {
          page: orderPage,
          perPage: orderPerPage,
        })
      ).filter(
        (order) =>
          String(order?.billing?.email || '').trim().toLowerCase() === normalizedEmail
      );
      const map = new Map();
      orders.forEach((order) => map.set(buildOrderKey(order), order));
      emailMatches.forEach((order) => map.set(buildOrderKey(order), order));
      orders = Array.from(map.values());
    }

    const shouldSearchByCedula =
      normalizedCedula && (!resolvedCustomerId || orders.length === 0);
    if (shouldSearchByCedula) {
      const cedulaMatches = toList(
        await woo.listOrdersBySearch(normalizedCedula, {
          page: orderPage,
          perPage: orderPerPage,
        })
      ).filter((order) => {
        const billingCedula = String(
          order?.meta_data?.find((item) =>
            String(item?.key || '').toLowerCase().includes('cedula')
          )?.value || ''
        ).replace(/\D+/g, '');
        const billingNit = String(
          order?.meta_data?.find((item) =>
            String(item?.key || '').toLowerCase().includes('nit')
          )?.value || ''
        ).replace(/\D+/g, '');
        return (
          normalizedCedula &&
          (billingCedula === normalizedCedula || billingNit === normalizedCedula)
        );
      });
      const map = new Map();
      orders.forEach((order) => map.set(buildOrderKey(order), order));
      cedulaMatches.forEach((order) => map.set(buildOrderKey(order), order));
      orders = Array.from(map.values());
    }
    return res.json({
      customerId: resolvedCustomerId,
      orders: orders,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'No se pudieron obtener pedidos',
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
    const data =
      method === 'GenerarInfoVentas'
        ? await cxc.generarInfoVentas(params)
        : await cxc.call(method, params);
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

app.get('/api/cxc/clientes/suggest', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) {
      return res.json([]);
    }
    await ensureClientsCacheFresh();
    const normalized = normalizeId(query);
    if (!normalized) {
      return res.json([]);
    }
    const results = [];
    for (const [cedula, info] of Object.entries(clientsCache.clients)) {
      if (!cedula.startsWith(normalized)) continue;
      results.push({
        cedula,
        name: info?.name || '',
      });
      if (results.length >= 8) break;
    }
    return res.json(results);
  } catch (error) {
    return res.status(500).json({
      error: 'No se pudieron consultar sugerencias',
      details: error?.message,
    });
  }
});

app.post('/api/cxc/detalle-facturas', async (req, res) => {
  try {
    const { params, debug } = req.body || {};
    const data = await cxc.generarInfoVentas(params || {});
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
      Object.assign(callParams, buildVentasParams({ cedula, fecha }), callParams);
    }

    const data = await cxc.generarInfoVentas(callParams);
    if (debug) {
      return res.json(data);
    }
    if (isCxcFunctionInactive(data?.xml)) {
      return res.status(502).json({
        error:
          'CxC respondió "Función no activa" para GenerarInfoVentas. Solicita al proveedor habilitar el método.',
      });
    }

    const payload = await fetchVentasPayload({ cedula, fecha });
    const filteredPayload = filterVentasPayload(payload, cedula);
    const name = findValueByKeys(filteredPayload || payload, [
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
    const idValue = findValueByKeys(filteredPayload || payload, [
      'cedula',
      'nit',
      'documento',
      'identificacion',
      'strpar_cedula',
      'strpar_nit',
    ]);
    const keyToUse = totalKey || 'VALTOT';
    const total = getVentasTotal(filteredPayload || payload, keyToUse);
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
