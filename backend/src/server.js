import './env.js';
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
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
const gspCareRequestsPath = path.resolve(__dirname, '../data', 'gspcare-requests.json');
const offersPath = path.resolve(__dirname, '../data', 'offers.json');
const weeklyProductPath = path.resolve(__dirname, '../data', 'weekly-product.json');
const bannersPath = path.resolve(__dirname, '../data', 'banners.json');
const clientsCachePath = path.resolve(__dirname, '../data', 'clients-cache.json');
const pushTokensPath = path.resolve(__dirname, '../data', 'push-tokens.json');
const pushHistoryPath = path.resolve(__dirname, '../data', 'push-history.json');
const cashbackRequestsPath = path.resolve(__dirname, '../data', 'cashback-requests.json');
const commercialTeamPath = path.resolve(__dirname, '../data', 'commercial-team.csv');
const adminUsersPath = path.resolve(__dirname, '../data', 'admin-users.json');
const CLIENTS_CACHE_REFRESH_HOURS = Number(
  process.env.CXC_CLIENTS_REFRESH_HOURS || 24
);
const CLIENTS_CACHE_MAX_PAGES = Number(process.env.CXC_CLIENTS_MAX_PAGES || 50);

const normalizeKey = (value) => String(value || '').toLowerCase();
const normalizeId = (value) => String(value || '').replace(/\D+/g, '').trim();
const stripLeadingZeros = (value) => String(value || '').replace(/^0+/, '');
const normalizeSearchText = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
const normalizeMetaList = (meta) => {
  if (Array.isArray(meta)) return meta;
  if (!meta || typeof meta !== 'object') return [];
  return Object.entries(meta).map(([key, value]) => ({ key, value }));
};
const resolveWooMetaValue = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      const resolved = resolveWooMetaValue(entry);
      if (resolved) return resolved;
    }
    return '';
  }
  if (typeof value === 'object') {
    return resolveWooMetaValue(
      value.value ??
        value.id ??
        value.cedula ??
        value.nit ??
        value.gsp_nit ??
        value.gsp_cedula ??
        ''
    );
  }
  return '';
};

const findWooMetaValue = (meta, keys) => {
  const normalized = keys.map((key) => String(key || '').toLowerCase());
  for (const key of normalized) {
    const entry = meta.find((item) => String(item?.key || '').toLowerCase() === key);
    const resolved = resolveWooMetaValue(entry?.value);
    if (resolved) return resolved;
  }
  for (const key of normalized) {
    const entry = meta.find((item) => String(item?.key || '').toLowerCase().includes(key));
    const resolved = resolveWooMetaValue(entry?.value);
    if (resolved) return resolved;
  }
  return '';
};

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

const normalizeSellerName = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

const normalizeSellerId = (value) => String(value || '').replace(/\D+/g, '').trim();

const ADMIN_SECTIONS = [
  'inicio',
  'clientes',
  'premios',
  'solicitudes-cashback',
  'notificaciones',
  'ofertas',
  'producto-semana',
  'banners',
  'gsp-care',
  'comercial',
  'usuarios',
];
const ADMIN_SECTION_LABELS = {
  inicio: 'Inicio',
  clientes: 'Buscar cliente',
  premios: 'Premios',
  'solicitudes-cashback': 'Solicitudes cashback',
  notificaciones: 'Notificaciones',
  ofertas: 'Ofertas',
  'producto-semana': 'Producto semana',
  banners: 'Banners',
  'gsp-care': 'GSP Care',
  comercial: 'Comercial',
  usuarios: 'Usuarios',
};
const ADMIN_PASSWORD_SALT = String(process.env.ADMIN_PORTAL_SALT || 'gsp_portal_salt');
const hashAdminPassword = (password) =>
  crypto
    .createHash('sha256')
    .update(`${ADMIN_PASSWORD_SALT}:${password}`)
    .digest('hex');

let commercialTeamCache = [];
let commercialTeamMtime = 0;
const COMMERCIAL_PHOTOS_BY_ID = {
  '68001': 'https://gsp.com.co/wp-content/uploads/2026/01/68001.png',
  '68002': 'https://gsp.com.co/wp-content/uploads/2026/01/68002.jpeg',
  '20002': 'https://gsp.com.co/wp-content/uploads/2026/01/20002-scaled.jpg',
  '11001': 'https://gsp.com.co/wp-content/uploads/2026/01/11001.jpg',
  '08002': 'https://gsp.com.co/wp-content/uploads/2026/01/08002-scaled.jpg',
  '01012': 'https://gsp.com.co/wp-content/uploads/2026/01/01012-scaled.jpg',
  '01001': 'https://gsp.com.co/wp-content/uploads/2026/01/01001-scaled.jpg',
  '11008': 'https://gsp.com.co/wp-content/uploads/2026/01/11008-scaled.jpg',
  '05000': 'https://gsp.com.co/wp-content/uploads/2026/01/05000-scaled.jpg',
  '76002': 'https://gsp.com.co/wp-content/uploads/2026/01/76002-scaled.jpg',
  '05002': 'https://gsp.com.co/wp-content/uploads/2026/01/05002-scaled.jpg',
  '11005': 'https://gsp.com.co/wp-content/uploads/2026/01/11005-scaled.jpg',
  '11002': 'https://gsp.com.co/wp-content/uploads/2026/01/11002-scaled.jpg',
  '66004': 'https://gsp.com.co/wp-content/uploads/2026/01/66004-scaled.jpg',
};
const parseCommercialTeamCsv = (raw) => {
  if (!raw) return [];
  const lines = raw.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];
  const sanitizeCell = (cell) =>
    String(cell || '')
      .trim()
      .replace(/^"+|"+$/g, '')
      .replace(/\s+/g, ' ');
  const header = lines[0].split(';').map(sanitizeCell);
  const idx = (name) => header.findIndex((item) => normalizeField(item) === normalizeField(name));
  const firstIndex = (names) => names.map(idx).find((i) => i >= 0) ?? -1;
  const vendorIndex = idx('VENDEDOR FOMPLUS');
  const vendorIdIndex = idx('ID VENDEDOR');
  const nameIndex = idx('NOMBRE');
  const phoneIndex = idx('CEL. CORPORATIVO');
  const emailIndex = idx('CORREO');
  const cityIndex = idx('CIUDAD');
  const photoIndex = firstIndex(['FOTO', 'IMAGEN', 'IMAGE', 'FOTO URL', 'IMAGEN URL']);
  return lines.slice(1).reduce((acc, line) => {
    const parts = line.split(';').map(sanitizeCell);
    const vendor = parts[vendorIndex] || '';
    const vendorId = normalizeSellerId(parts[vendorIdIndex]);
    const photo = photoIndex >= 0 ? parts[photoIndex] || '' : '';
    if (!vendor) return acc;
    acc.push({
      vendor,
      vendorId,
      vendorIdKey: vendorId ? stripLeadingZeros(vendorId) : '',
      vendorKey: normalizeSellerName(vendor),
      name: parts[nameIndex] || '',
      phone: parts[phoneIndex] || '',
      email: parts[emailIndex] || '',
      city: parts[cityIndex] || '',
      image: photo,
    });
    return acc;
  }, []);
};

const loadCommercialTeam = () => {
  try {
    const stats = fs.statSync(commercialTeamPath);
    const mtime = stats.mtimeMs || 0;
    if (commercialTeamCache.length > 0 && commercialTeamMtime === mtime) {
      return commercialTeamCache;
    }
    const raw = fs.readFileSync(commercialTeamPath, 'utf-8');
    commercialTeamCache = parseCommercialTeamCsv(raw);
    commercialTeamMtime = mtime;
    return commercialTeamCache;
  } catch (_error) {
    commercialTeamCache = [];
    commercialTeamMtime = 0;
    return [];
  }
};

const loadCommercialRaw = () => {
  try {
    return fs.readFileSync(commercialTeamPath, 'utf-8');
  } catch (_error) {
    return '';
  }
};

const saveCommercialRaw = (raw) => {
  try {
    fs.mkdirSync(path.dirname(commercialTeamPath), { recursive: true });
    fs.writeFileSync(commercialTeamPath, String(raw || '').trim());
    commercialTeamCache = [];
    commercialTeamMtime = 0;
    return true;
  } catch (error) {
    console.error('No se pudo guardar commercial-team.csv:', error?.message || error);
    return false;
  }
};

const loadPushHistory = () => {
  try {
    const raw = fs.readFileSync(pushHistoryPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
};

const savePushHistory = (items) => {
  try {
    fs.mkdirSync(path.dirname(pushHistoryPath), { recursive: true });
    fs.writeFileSync(pushHistoryPath, JSON.stringify(items, null, 2));
    return true;
  } catch (error) {
    console.error('No se pudo guardar push-history.json:', error?.message || error);
    return false;
  }
};

const recordPushHistory = (entry) => {
  const current = loadPushHistory();
  current.unshift(entry);
  return savePushHistory(current.slice(0, 200));
};

const defaultAdminRoles = () => [
  { id: 'admin', name: 'Administrador', permissions: [...ADMIN_SECTIONS] },
  { id: 'operaciones', name: 'Operaciones', permissions: ['inicio', 'clientes', 'premios', 'solicitudes-cashback'] },
  { id: 'marketing', name: 'Marketing', permissions: ['inicio', 'notificaciones', 'ofertas', 'banners'] },
  { id: 'comercial', name: 'Comercial', permissions: ['inicio', 'comercial', 'clientes'] },
];

const ensureJsonFile = (targetPath, fallbackValue) => {
  try {
    if (fs.existsSync(targetPath)) return;
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, JSON.stringify(fallbackValue, null, 2));
  } catch (error) {
    console.error('No se pudo crear archivo base:', error?.message || error);
  }
};

const ensureDataFiles = () => {
  ensureJsonFile(offersPath, []);
  ensureJsonFile(weeklyProductPath, null);
  ensureJsonFile(bannersPath, []);
  ensureJsonFile(gspCarePath, []);
  ensureJsonFile(pushHistoryPath, []);
  ensureJsonFile(adminUsersPath, { users: [], roles: defaultAdminRoles() });
};

const loadAdminUsers = () => {
  try {
    const raw = fs.readFileSync(adminUsersPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const users = Array.isArray(parsed?.users) ? parsed.users : [];
    const roles = Array.isArray(parsed?.roles) ? parsed.roles : defaultAdminRoles();
    return { users, roles };
  } catch (_error) {
    return { users: [], roles: defaultAdminRoles() };
  }
};

const saveAdminUsers = ({ users = [], roles = [] } = {}) => {
  try {
    fs.mkdirSync(path.dirname(adminUsersPath), { recursive: true });
    fs.writeFileSync(
      adminUsersPath,
      JSON.stringify({ users, roles, updatedAt: new Date().toISOString() }, null, 2)
    );
    return true;
  } catch (error) {
    console.error('No se pudo guardar admin-users.json:', error?.message || error);
    return false;
  }
};

const resolveRolePermissions = ({ roleId, roles }) => {
  if (!roleId) return [];
  if (roleId === 'admin') return [...ADMIN_SECTIONS];
  const match = roles.find((role) => role.id === roleId);
  return Array.isArray(match?.permissions) ? match.permissions : [];
};

const buildAdminSession = ({ username, roleId, roles, source }) => {
  const permissions = resolveRolePermissions({ roleId, roles });
  return {
    username,
    roleId,
    permissions,
    source,
  };
};

const canAccessSection = (section, permissions = []) => {
  if (!section) return false;
  if (permissions.includes('admin')) return true;
  return permissions.includes(section);
};

const allowedSectionsFor = (permissions = []) =>
  ADMIN_SECTIONS.filter((section) => canAccessSection(section, permissions));

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
  'cli_documento',
  'cli_identificacion',
  'strcli_cedula',
  'strcli_nit',
  'strcli_documento',
  'strcli_identificacion',
  'strcli_doc',
  'strpar_cedula',
  'strpar_nit',
  'strpar_documento',
  'strpar_identificacion',
  'strpar_doc',
  'cliente_nit',
  'cliente_cedula',
  'nit_cliente',
  'nitcliente',
  'documento_cliente',
  'identificacion_cliente',
  'numero_documento',
  'num_documento',
  'idcliente',
  'cliente_id',
  'clienteid',
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
const CARTERA_CUPO_KEYS = [
  'cupo',
  'cupo_credito',
  'credito',
  'creditolimit',
  'cli_cupcre',
  'cli_cupcred',
  'limite_credito',
  'limitecredito',
  'limite',
  'cupo_disponible',
  'cupodisponible',
  'credito_disponible',
  'creditodisponible',
  'cupo_aprobado',
];
const CARTERA_SALDO_KEYS = [
  'saldo',
  'saldo_total',
  'saldototal',
  'total',
  'total_cartera',
  'cartera_total',
];
const CARTERA_POR_VENCER_KEYS = [
  'por_vencer',
  'porvencer',
  'saldo_por_vencer',
  'no_vencido',
  'saldo_no_vencido',
  'por_vencer_total',
];
const CARTERA_VENCIDO_KEYS = [
  'vencido',
  'saldo_vencido',
  'vencido_total',
  'cartera_vencida',
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
  const valueNoZeros = stripLeadingZeros(normalizedValue);
  const targetNoZeros = stripLeadingZeros(target);
  if (valueNoZeros && targetNoZeros && valueNoZeros === targetNoZeros) {
    return true;
  }
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

const findClientInfo = async ({ cedula, vendedor, useRemoteFallback = true }) => {
  const normalized = normalizeId(cedula);
  const cacheTotal = Object.keys(clientsCache.clients).length;
  if (normalized && clientsCache.clients[normalized]) {
    return {
      info: clientsCache.clients[normalized],
      meta: { total: cacheTotal, pages: 1 },
      pagesScanned: 0,
      vendedor: 'cache',
    };
  }
  if (!useRemoteFallback) {
    return {
      info: null,
      meta: { total: cacheTotal, pages: 1 },
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
    .estadoCartera({ fecha: formatDateTimeNow(), cedula })
    .catch(() => null);
  const payload = data
    ? parseMaybeJson(data.result ?? data.response ?? data.parsed ?? {})
    : null;
  const seller = findValueByKeys(payload, CARTERA_SELLER_KEYS);
  return String(seller || '').trim();
};

const resolveSellerFromClients = async (cedula) => {
  if (!cedula) return '';
  await ensureClientsCacheFresh();
  const cached = await findClientInfo({
    cedula,
    vendedor: '',
    useRemoteFallback: false,
  });
  const cachedSeller = String(cached?.info?.seller || '').trim();
  if (cachedSeller) return cachedSeller;
  const remote = await findClientInfo({
    cedula,
    vendedor: '',
    useRemoteFallback: true,
  });
  return String(remote?.info?.seller || '').trim();
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
const formatDateTimeNow = () => new Date().toISOString();

const parseCarteraNumber = (value) => {
  if (typeof value === 'number') return value;
  const raw = String(value || '').replace(/[^\d.-]/g, '');
  if (!raw) return 0;
  const numeric = Number.parseFloat(raw);
  return Number.isNaN(numeric) ? 0 : numeric;
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
  const normalizedCedula = normalizeId(cedula);
  return {
    strPar_Empresa: CXC_EMPRESA,
    strPar_Nit: normalizedCedula || undefined,
    strPar_Cedula: normalizedCedula || undefined,
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

const fetchVentasPayload = async ({ cedula, fecha, from, to, chunkDays } = {}) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const rangeStart = from || fecha || startOfMonth;
  const rangeEnd = to || fecha || now;
  const rangeChunkDays =
    Number.isFinite(chunkDays) && chunkDays > 0
      ? chunkDays
      : Number.isFinite(CXC_VENTAS_CHUNK_DAYS) && CXC_VENTAS_CHUNK_DAYS > 0
        ? CXC_VENTAS_CHUNK_DAYS
        : 7;
  if (!rangeStart || !rangeEnd) return [];
  const cacheKey = [
    'ventas',
    normalizeId(cedula),
    formatDateOnly(rangeStart),
    formatDateOnly(rangeEnd),
    rangeChunkDays,
  ].join('|');
  const cached = ventasCache.get(cacheKey);
  if (cached) return cached;
  const payload = await fetchVentasRange({
    cedula,
    from: rangeStart,
    to: rangeEnd,
    chunkDays: rangeChunkDays,
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
      chunkDays: 7,
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
  gspCareVerCedula = '',
  gspCareError = '',
  gspCareServices = [],
  offers = [],
  weeklyProduct = null,
  commercialTeamRaw = '',
  commercialTeamCount = 0,
  adminRoles = [],
  adminUsers = [],
  editRole = null,
  editUser = null,
  pushHistory = [],
  allowedSections = ADMIN_SECTIONS,
  section = 'inicio',
  refreshStatus = '',
  notificationStatus = '',
  pushTokensCount = 0,
  cashbackRequests = [],
  banners = [],
  timings = null,
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
  const normalizedCedula = normalizeId(cedula);
  const carePlan = normalizedCedula
    ? gspCareList.find((item) => item.cedula === normalizedCedula)?.plan
    : '';
  const careStatus = gspCareActive
    ? `Activo${carePlan ? ` · ${escapeHtml(carePlan)}` : ''}`
    : 'No activo';
  const normalizedSection = String(section || 'inicio').trim() || 'inicio';
  const showDashboard = normalizedSection === 'inicio';
  const showClientes = normalizedSection === 'clientes';
  const showPremios = normalizedSection === 'premios';
  const showSolicitudesCashback = normalizedSection === 'solicitudes-cashback';
  const showCare = normalizedSection === 'gsp-care';
  const showNotifications = normalizedSection === 'notificaciones';
  const showOfertas = normalizedSection === 'ofertas';
  const showWeekly = normalizedSection === 'producto-semana';
  const showBanners = normalizedSection === 'banners';
  const showComercial = normalizedSection === 'comercial';
  const showUsuarios = normalizedSection === 'usuarios';
  const todayStr = new Date().toISOString().slice(0, 10);
  const gspCareMember = gspCareVerCedula
    ? gspCareList.find((item) => item.cedula === normalizeId(gspCareVerCedula))
    : null;
  const gspCareServiceRows =
    gspCareMember && Array.isArray(gspCareServices)
      ? gspCareServices.map((svc) => {
          const limit = getGspCareLimitForPlan(svc, gspCareMember.plan);
          const categoryId = svc.categoryId;
          const used = Number(gspCareMember.periodConsumption?.[categoryId] ?? 0);
          const remaining =
            limit == null ? null : Math.max(0, limit - used);
          return {
            id: svc.id,
            name: svc.name,
            categoryId,
            marca: svc.marca,
            modalidad: svc.modalidad,
            limit: limit == null ? '—' : String(limit),
            used,
            remaining: limit == null ? '—' : String(remaining),
            remainingNum: remaining,
          };
        })
      : [];
  const gspCareBolsones =
    gspCareMember && GSP_CARE_CATEGORY_IDS
      ? GSP_CARE_CATEGORY_IDS.map((catId) => {
          const limit = getGspCareCategoryLimitForPlan(catId, gspCareMember.plan);
          const used = Number(gspCareMember.periodConsumption?.[catId] ?? 0);
          const remaining = limit == null ? 0 : Math.max(0, limit - used);
          return {
            id: catId,
            name: GSP_CARE_CATEGORIES[catId]?.name || catId,
            limit: limit == null ? '—' : limit,
            used,
            remaining,
          };
        })
      : [];
  const gspCareMemberRequests = gspCareVerCedula
    ? (() => {
        const list = loadGspCareRequests();
        const norm = normalizeId(gspCareVerCedula);
        return list.filter((r) => r.cedula === norm);
      })()
    : [];
  const navLinks = allowedSections
    .filter((key) => ADMIN_SECTION_LABELS[key])
    .map(
      (key) =>
        `<a href="/admin/rewards?section=${encodeURIComponent(key)}">${escapeHtml(
          ADMIN_SECTION_LABELS[key]
        )}</a>`
    )
    .join('');
  const roleLabelById = adminRoles.reduce((acc, role) => {
    acc[role.id] = role.name;
    return acc;
  }, {});
  const roleOptions = adminRoles
    .map(
      (role) =>
        `<option value="${escapeHtml(role.id)}" ${
          editUser?.roleId === role.id ? 'selected' : ''
        }>${escapeHtml(role.name)}</option>`
    )
    .join('');
  const rolePermissions = editRole?.permissions || [];
  const permissionCheckboxes = ADMIN_SECTIONS.map((section) => {
    const checked = rolePermissions.includes(section) ? 'checked' : '';
    return `<label style="display:flex; align-items:center; gap:8px; font-size:13px;">
      <input type="checkbox" name="permissions" value="${escapeHtml(section)}" ${checked} />
      ${escapeHtml(ADMIN_SECTION_LABELS[section] || section)}
    </label>`;
  }).join('');
  const rolesList = adminRoles
    .map(
      (role) => `<div class="subcard">
        <h3>${escapeHtml(role.name)}</h3>
        <div class="label">Permisos: ${role.permissions?.length || 0}</div>
        <div class="reward-actions">
          <a href="/admin/rewards?section=usuarios&roleId=${escapeHtml(
            role.id
          )}" class="btn-secondary" style="text-decoration:none;display:inline-flex;align-items:center;padding:8px 12px;">Editar</a>
          <form method="post" action="/admin/roles/delete">
            <input type="hidden" name="section" value="usuarios" />
            <input type="hidden" name="id" value="${escapeHtml(role.id)}" />
            <button type="submit" class="btn-secondary">Eliminar</button>
          </form>
        </div>
      </div>`
    )
    .join('');
  const usersList = adminUsers
    .map(
      (user) => `<div class="subcard">
        <h3>${escapeHtml(user.username)}</h3>
        <div class="label">Rol: ${escapeHtml(roleLabelById[user.roleId] || '—')}</div>
        <div class="label">Estado: ${user.active ? 'Activo' : 'Inactivo'}</div>
        <div class="reward-actions">
          <a href="/admin/rewards?section=usuarios&userId=${escapeHtml(
            user.id
          )}" class="btn-secondary" style="text-decoration:none;display:inline-flex;align-items:center;padding:8px 12px;">Editar</a>
          <form method="post" action="/admin/users/delete">
            <input type="hidden" name="section" value="usuarios" />
            <input type="hidden" name="id" value="${escapeHtml(user.id)}" />
            <button type="submit" class="btn-secondary">Eliminar</button>
          </form>
        </div>
      </div>`
    )
    .join('');
  const pushHistoryRows = pushHistory
    .map(
      (item) => `<div class="subcard">
        <div class="label"><strong>${escapeHtml(item.title || '')}</strong></div>
        <div class="label">${escapeHtml(item.body || '')}</div>
        <div class="label">Enviado por: ${escapeHtml(item.sentBy || '—')}</div>
        <div class="label">Fecha: ${escapeHtml(item.sentAt || '—')}</div>
        <div class="label">Estado: ${escapeHtml(item.status || '—')}</div>
        <div class="label">Resultados: ${item.sent || 0}/${item.total || 0} ok</div>
      </div>`
    )
    .join('');
  const rewardsCount = rewardsList.length;
  const careCount = gspCareList.length;
  const gspCareSavings = [
    { label: 'Basic (3 Meses)', value: 328900 },
    { label: 'Professional (6 Meses)', value: 491900 },
    { label: 'Premium (1 Año)', value: 1055000 },
  ];
  const gspCareSavingsTotal = gspCareSavings.reduce(
    (sum, item) => sum + item.value,
    0
  );
  const displayName = clientInfo?.name || clientName;

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GSP Pro - Portal</title>
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
          ${navLinks}
          <a href="/admin/logout">Cerrar sesión</a>
        </nav>
      </div>
    </header>
    <div class="container">
      <div class="layout">
        <aside class="sidebar">
          <strong>Menú</strong>
          ${navLinks}
          <a href="/admin/logout">Cerrar sesión</a>
        </aside>

        <main style="display:flex; flex-direction:column; gap:20px;">
          ${
            showDashboard
              ? `<div id="inicio" class="card">
            <h1>Dashboard GSP Pro</h1>
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
            <form class="form" method="post" action="/admin/rewards/refresh-clients">
              <input type="hidden" name="section" value="clientes" />
              <button type="submit" class="btn-secondary">Refrescar clientes</button>
            </form>
            ${
              refreshStatus === 'ok'
                ? `<div class="muted">Clientes refrescados manualmente.</div>`
                : refreshStatus === 'error'
                  ? `<div class="label">No se pudo refrescar clientes.</div>`
                  : ''
            }
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
                timings
                  ? `<div class="muted">Tiempos: clientes ${
                      timings.search?.baseMs ?? '—'
                    }ms · ventas ${timings.ventasMs ?? '—'}ms · resumen ${
                      timings.monthlyMs ?? '—'
                    }ms</div>`
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
            showSolicitudesCashback
              ? `<div id="solicitudes-cashback" class="card">
            <h2 class="section-title">Solicitudes de cashback</h2>
            <p class="section-subtitle">
              Lista de solicitudes de cashback. Cierra cada una con el número y monto de la NC generada en el ERP.
            </p>
            ${notificationStatus === 'closed'
              ? '<div class="alert" style="border-color: rgba(16, 185, 129, 0.5); color: #34d399;">Solicitud cerrada correctamente.</div>'
              : ''}
            <div class="grid" style="margin-top:16px;">
              ${
                cashbackRequests.length
                  ? cashbackRequests
                      .map(
                        (r) => `<div class="subcard" style="display:flex;flex-direction:column;gap:8px;">
                        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;">
                          <div>
                            <strong>Cédula:</strong> ${escapeHtml(r.cedula || '')}
                            &nbsp;|&nbsp;
                            <strong>Monto solicitado:</strong> $${formatNumber(Number(r.amount) || 0)}
                            &nbsp;|&nbsp;
                            <strong>Fecha:</strong> ${escapeHtml((r.createdAt || '').slice(0, 10))}
                          </div>
                          <span class="label" style="padding:4px 8px;border-radius:6px;background:${
                            r.status === 'completed' ? 'rgba(16,185,129,0.2)' : 'rgba(251,191,36,0.2)'
                          };">${r.status === 'completed' ? 'Cerrada' : 'Pendiente'}</span>
                        </div>
                        ${
                          r.status === 'completed'
                            ? `<div class="label">NC: ${escapeHtml(String(r.ncNumber || ''))} · Monto NC: $${formatNumber(Number(r.ncAmount) || 0)}</div>`
                            : `<form method="post" action="/admin/cashback/close" style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;">
                            <input type="hidden" name="requestId" value="${escapeHtml(r.id)}" />
                            <input type="hidden" name="section" value="solicitudes-cashback" />
                            <input type="text" name="ncNumber" placeholder="Nº documento NC" required style="min-width:140px;" />
                            <input type="number" name="ncAmount" placeholder="Monto NC" required min="0" step="1" style="min-width:120px;" />
                            <button type="submit">Cerrar con NC</button>
                          </form>`
                        }
                      </div>`
                      )
                      .join('')
                  : '<div class="alert">No hay solicitudes de cashback.</div>'
              }
            </div>
          </div>`
              : ''
          }

          ${
            showNotifications
              ? `<div id="notificaciones" class="card">
            <h2 class="section-title">Notificaciones push</h2>
            <p class="section-subtitle">
              Envía mensajes a los usuarios registrados en la app.
            </p>
            ${notificationStatus === 'ok'
              ? '<div class="alert" style="border-color: rgba(16, 185, 129, 0.5); color: #34d399;">Notificación enviada.</div>'
              : ''}
            ${notificationStatus === 'error'
              ? '<div class="alert">No se pudo enviar la notificación.</div>'
              : ''}
            <div class="label">Tokens activos: <strong>${pushTokensCount}</strong></div>
            <form class="form-grid" method="post" action="/admin/notifications/send">
              <input type="hidden" name="section" value="notificaciones" />
              <input type="text" name="title" placeholder="Título" required />
              <input type="text" name="body" placeholder="Mensaje" required />
              <input type="text" name="url" placeholder="URL opcional (ej. https://gsp.com.co)" />
              <button type="submit">Enviar notificación</button>
            </form>
            <h3 class="section-title" style="font-size:16px; margin-top:16px;">Historial</h3>
            <div class="grid" style="margin-top:12px;">
              ${pushHistoryRows || '<div class="alert">No hay notificaciones enviadas.</div>'}
            </div>
          </div>`
              : ''
          }

          ${
            showOfertas
              ? `<div id="ofertas" class="card">
            <h2 class="section-title">Ofertas</h2>
            <p class="section-subtitle">
              Publica ofertas que verán los clientes en la app.
            </p>
            <form class="form-grid" method="post" action="/admin/offers/save">
              <input type="hidden" name="section" value="ofertas" />
              <input type="text" name="title" placeholder="Título" required />
              <input type="text" name="subtitle" placeholder="Subtítulo" />
              <input type="text" name="price" placeholder="Precio" />
              <input type="text" name="image" placeholder="URL de imagen" />
              <input type="text" name="searchQuery" placeholder="SKU o búsqueda" />
              <input type="text" name="cta" placeholder="Texto botón (ej. Ver oferta)" />
              <button type="submit">Agregar oferta</button>
            </form>
            <div class="grid" style="margin-top:16px;">
              ${offers.length
                ? offers
                    .map(
                      (offer) => `<div class="subcard">
                        ${offer.image ? `<img class="reward-image" src="${offer.image}" alt="${escapeHtml(offer.title || '')}" />` : ''}
                        <h3>${escapeHtml(offer.title || '')}</h3>
                        <div class="label">${escapeHtml(offer.subtitle || '')}</div>
                        <div class="label">${escapeHtml(offer.price || '')}</div>
                        <div class="label">Búsqueda: ${escapeHtml(offer.searchQuery || '—')}</div>
                        <div class="reward-actions">
                          <form method="post" action="/admin/offers/delete">
                            <input type="hidden" name="section" value="ofertas" />
                            <input type="hidden" name="id" value="${offer.id}" />
                            <button type="submit" class="btn-secondary">Eliminar</button>
                          </form>
                        </div>
                      </div>`
                    )
                    .join('')
                : '<div class="alert">No hay ofertas registradas.</div>'}
            </div>
          </div>`
              : ''
          }

          ${
            showWeekly
              ? `<div id="producto-semana" class="card">
            <h2 class="section-title">Producto de la semana</h2>
            <p class="section-subtitle">
              Define el producto destacado en la app.
            </p>
            <form class="form-grid" method="post" action="/admin/weekly/save">
              <input type="hidden" name="section" value="producto-semana" />
              <input type="text" name="title" placeholder="Título" required value="${escapeHtml(
                weeklyProduct?.title || ''
              )}" />
              <input type="text" name="subtitle" placeholder="Subtítulo" value="${escapeHtml(
                weeklyProduct?.subtitle || ''
              )}" />
              <input type="text" name="price" placeholder="Precio" value="${escapeHtml(
                weeklyProduct?.price || ''
              )}" />
              <input type="text" name="image" placeholder="URL de imagen" value="${escapeHtml(
                weeklyProduct?.image || ''
              )}" />
              <input type="text" name="searchQuery" placeholder="SKU o búsqueda" value="${escapeHtml(
                weeklyProduct?.searchQuery || ''
              )}" />
              <input type="text" name="cta" placeholder="Texto botón" value="${escapeHtml(
                weeklyProduct?.cta || ''
              )}" />
              <button type="submit">Guardar producto</button>
            </form>
            ${
              weeklyProduct
                ? `<div class="subcard" style="margin-top:16px;">
                    ${weeklyProduct.image ? `<img class="reward-image" src="${weeklyProduct.image}" alt="${escapeHtml(weeklyProduct.title || '')}" />` : ''}
                    <h3>${escapeHtml(weeklyProduct.title || '')}</h3>
                    <div class="label">${escapeHtml(weeklyProduct.subtitle || '')}</div>
                    <div class="label">${escapeHtml(weeklyProduct.price || '')}</div>
                    <div class="label">Búsqueda: ${escapeHtml(weeklyProduct.searchQuery || '—')}</div>
                  </div>`
                : '<div class="alert">No hay producto configurado.</div>'
            }
          </div>`
              : ''
          }

          ${
            showBanners
              ? `<div id="banners" class="card">
            <h2 class="section-title">Banners del carrusel (inicio app)</h2>
            <p class="section-subtitle">
              Imágenes del carrusel que se muestran arriba en la pantalla de inicio. Orden: el primero es el que aparece primero.
            </p>
            <form class="form-grid" method="post" action="/admin/banners/save">
              <input type="hidden" name="section" value="banners" />
              <input type="text" name="imageUrl" placeholder="URL de la imagen" required />
              <input type="text" name="link" placeholder="URL al hacer clic (opcional)" />
              <button type="submit">Agregar banner</button>
            </form>
            <div class="grid" style="margin-top:16px;">
              ${
                banners.length
                  ? banners
                      .map(
                        (b, i) => `<div class="subcard">
                        ${b.imageUrl ? `<img class="reward-image" src="${escapeHtml(b.imageUrl)}" alt="Banner ${i + 1}" style="max-height:120px;object-fit:cover;" />` : ''}
                        <div class="label">#${i + 1} ${escapeHtml(b.link || 'Sin enlace')}</div>
                        <form method="post" action="/admin/banners/delete" style="margin-top:8px;">
                          <input type="hidden" name="section" value="banners" />
                          <input type="hidden" name="id" value="${escapeHtml(b.id)}" />
                          <button type="submit" class="btn-secondary">Eliminar</button>
                        </form>
                      </div>`
                      )
                      .join('')
                  : '<div class="alert">No hay banners. Agrega la URL de una imagen.</div>'
              }
            </div>
          </div>`
              : ''
          }

          ${
            showComercial
              ? `<div id="comercial" class="card">
            <h2 class="section-title">Equipo comercial</h2>
            <p class="section-subtitle">
              Actualiza el listado de comerciales que se muestra en la app.
            </p>
            <div class="label">Contactos cargados: <strong>${commercialTeamCount}</strong></div>
            <form class="form-grid" method="post" action="/admin/comercial/save">
              <input type="hidden" name="section" value="comercial" />
              <textarea
                name="csv"
                placeholder="VENDEDOR FOMPLUS;ID VENDEDOR;NOMBRE;CEL. CORPORATIVO;CORREO;CIUDAD"
                style="min-height:240px;"
              >${escapeHtml(commercialTeamRaw)}</textarea>
              <button type="submit">Guardar listado</button>
            </form>
            <div class="muted" style="margin-top:12px;">
              Usa formato CSV con separador punto y coma (;). Encabezado requerido.
              Campo FOTO es opcional.
            </div>
          </div>`
              : ''
          }

          ${
            showUsuarios
              ? `<div id="usuarios" class="card">
            <h2 class="section-title">Usuarios y roles</h2>
            <p class="section-subtitle">
              Crea usuarios para el portal y asigna permisos por sección.
            </p>
            <div class="row" style="gap:24px;">
              <div style="flex:1; min-width:280px;">
                <h3 class="section-title" style="font-size:16px;">Roles</h3>
                <form class="form-grid" method="post" action="/admin/roles/save">
                  <input type="hidden" name="section" value="usuarios" />
                  <input type="hidden" name="id" value="${escapeHtml(editRole?.id || '')}" />
                  <input type="text" name="name" placeholder="Nombre del rol" value="${escapeHtml(
                    editRole?.name || ''
                  )}" required />
                  <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
                    ${permissionCheckboxes}
                  </div>
                  <button type="submit">${editRole?.id ? 'Guardar rol' : 'Crear rol'}</button>
                </form>
                <div class="grid" style="margin-top:16px;">
                  ${rolesList || '<div class="alert">No hay roles configurados.</div>'}
                </div>
              </div>
              <div style="flex:1; min-width:280px;">
                <h3 class="section-title" style="font-size:16px;">Usuarios</h3>
                <form class="form-grid" method="post" action="/admin/users/save">
                  <input type="hidden" name="section" value="usuarios" />
                  <input type="hidden" name="id" value="${escapeHtml(editUser?.id || '')}" />
                  <input type="text" name="username" placeholder="Usuario" value="${escapeHtml(
                    editUser?.username || ''
                  )}" required />
                  <input type="password" name="password" placeholder="${
                    editUser?.id ? 'Nueva contraseña (opcional)' : 'Contraseña'
                  }" ${editUser?.id ? '' : 'required'} />
                  <select name="roleId" required>
                    <option value="">Selecciona un rol</option>
                    ${roleOptions}
                  </select>
                  <label style="display:flex; gap:8px; align-items:center;">
                    <input type="checkbox" name="active" ${
                      editUser?.active === false ? '' : 'checked'
                    } />
                    Activo
                  </label>
                  <button type="submit">${editUser?.id ? 'Guardar usuario' : 'Crear usuario'}</button>
                </form>
                <div class="grid" style="margin-top:16px;">
                  ${usersList || '<div class="alert">No hay usuarios creados.</div>'}
                </div>
              </div>
            </div>
          </div>`
              : ''
          }

      ${
        showDashboard
          ? `<div class="card">
        <h2>¿Cómo funciona GSP Pro?</h2>
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
          Activa membresía (fecha de activación y vencimiento automáticos según tipo). Consulta servicios y registra consumo.
        </p>
        <div class="subcard" style="margin-top:12px;">
          <div class="label" style="margin-bottom:8px;">
            Lo que ahorraría el cliente (pagando cada servicio a valor unitario)
          </div>
          <div class="grid">
            ${gspCareSavings
              .map(
                (item) => `<div class="item">
                  <span>${escapeHtml(item.label)}</span>
                  <strong>$${formatNumber(item.value)}</strong>
                </div>`
              )
              .join('')}
          </div>
          <div class="label" style="margin-top:6px;">
            Precios IVA incluido: Basic $299.900 · Professional $449.900 · Premium $699.900
          </div>
        </div>
        <form class="form" method="post" action="/admin/gspcare/save">
          <input type="hidden" name="section" value="gsp-care" />
          <input type="text" name="cedula" placeholder="NIT o cédula" required />
          <select name="plan" required>
            <option value="">Selecciona tipo de membresía</option>
            <option value="Basic">Basic (3 Meses)</option>
            <option value="Professional">Professional (6 Meses)</option>
            <option value="Premium">Premium (1 Año)</option>
          </select>
          <button type="submit">Activar</button>
        </form>
        <p class="label" style="margin-top:8px;">La fecha de activación se asigna automáticamente al activar. El vencimiento: Basic 3 meses, Professional 6 meses, Premium 1 año.</p>
        <div class="grid" style="margin-top:16px;">
          ${
            gspCareList.length > 0
              ? gspCareList
                  .map(
                    (item) => {
                      const exp = item.expiresAt || getGspCareExpiresAt(item.activatedAt, item.plan);
                      const isExpired = exp && exp < todayStr;
                      const statusLabel = isExpired ? 'Vencida' : 'Vigente';
                      const statusClass = isExpired ? 'alert' : '';
                      return `<div class="subcard">
                    <h3>${escapeHtml(item.cedula)}</h3>
                    <div class="label">Membresía: ${escapeHtml(item.plan || '—')}</div>
                    <div class="label">Activado: ${escapeHtml(item.activatedAt || '—')}</div>
                    <div class="label">Vence: ${escapeHtml(exp || '—')}</div>
                    <div class="label"><strong>${statusLabel}</strong></div>
                    <div class="reward-actions" style="display:flex;gap:8px;flex-wrap:wrap;">
                      <a href="/admin/rewards?section=gsp-care&ver=${encodeURIComponent(item.cedula)}" class="btn-secondary">Ver servicios</a>
                      <form method="post" action="/admin/gspcare/delete" style="display:inline;">
                        <input type="hidden" name="section" value="gsp-care" />
                        <input type="hidden" name="cedula" value="${escapeHtml(item.cedula)}" />
                        <button type="submit" class="btn-secondary">Desactivar</button>
                      </form>
                    </div>
                  </div>`;
                    }
                  )
                  .join('')
              : '<div class="alert">No hay membresías activas.</div>'
          }
        </div>
        ${
          gspCareMember
            ? (() => {
                const errorMsg = gspCareError === 'cupo-agotado' ? 'Cupo agotado para esta categoría.' : gspCareError === 'no-member' ? 'Cliente sin membresía activa.' : gspCareError === 'invalid-service' ? 'Servicio no válido.' : gspCareError === 'already-completed' ? 'La solicitud ya está completada.' : '';
                const servicesWithCupo = gspCareServiceRows.filter((row) => row.remainingNum != null && row.remainingNum > 0);
                return `<div class="subcard" style="margin-top:20px;">
          <h3>Bolsones (cupos por categoría) · ${escapeHtml(gspCareMember.cedula)} (${escapeHtml(gspCareMember.plan || '—')})</h3>
          <p class="label"><a href="/admin/rewards?section=gsp-care">← Volver a lista</a></p>
          ${errorMsg ? `<p class="label" style="color:var(--warning);">${escapeHtml(errorMsg)}</p>` : ''}
          <table style="width:100%;border-collapse:collapse;margin-top:12px;">
            <thead><tr style="border-bottom:1px solid var(--surface);"><th style="text-align:left;padding:8px;">Categoría</th><th style="text-align:center;padding:8px;">Límite</th><th style="text-align:center;padding:8px;">Usado</th><th style="text-align:center;padding:8px;">Disponible</th></tr></thead>
            <tbody>
              ${(gspCareBolsones || []).map((b) => `<tr style="border-bottom:1px solid var(--surface);"><td style="padding:8px;">${escapeHtml(b.name)}</td><td style="text-align:center;padding:8px;">${b.limit}</td><td style="text-align:center;padding:8px;">${b.used}</td><td style="text-align:center;padding:8px;">${b.remaining}</td></tr>`).join('')}
            </tbody>
          </table>
          <h4 style="margin-top:16px;">Solicitudes (servicios)</h4>
          <table style="width:100%;border-collapse:collapse;margin-top:8px;">
            <thead><tr style="border-bottom:1px solid var(--surface);"><th style="text-align:left;padding:6px;">Fecha</th><th style="text-align:left;padding:6px;">Servicio</th><th style="text-align:left;padding:6px;">Marca / Modalidad</th><th style="text-align:left;padding:6px;">Cliente/Equipo</th><th style="text-align:center;padding:6px;">Estado</th><th></th></tr></thead>
            <tbody>
              ${(gspCareMemberRequests || []).length === 0 ? '<tr><td colspan="6" style="padding:12px;">Sin solicitudes.</td></tr>' : (gspCareMemberRequests || []).map((r) => `<tr style="border-bottom:1px solid var(--surface);"><td style="padding:6px;">${escapeHtml(r.date || '—')}</td><td style="padding:6px;">${escapeHtml(r.serviceName || '—')}</td><td style="padding:6px;">${escapeHtml((r.brand || '') + ' / ' + (r.modality || ''))}</td><td style="padding:6px;">${escapeHtml(r.clientOrEquipment || '—')}</td><td style="text-align:center;padding:6px;">${r.status === 'completed' ? 'Completado' : 'Pendiente'}</td><td style="padding:6px;">${r.status === 'pending' ? `<form method="post" action="/admin/gspcare/request/complete" style="display:inline;"><input type="hidden" name="requestId" value="${escapeHtml(r.id)}" /><button type="submit" class="btn-secondary">Completar</button></form>` : ''}</td></tr>`).join('')}
            </tbody>
          </table>
          <form class="form" method="post" action="/admin/gspcare/request/create" style="margin-top:16px;">
            <input type="hidden" name="section" value="gsp-care" />
            <input type="hidden" name="cedula" value="${escapeHtml(gspCareMember.cedula)}" />
            <label class="label">Nueva solicitud (descuenta 1 del bolsón de la categoría al completarla)</label>
            <select name="serviceId" required>
              <option value="">Servicio</option>
              ${(servicesWithCupo || []).map((row) => `<option value="${escapeHtml(row.id)}">[${escapeHtml(row.categoryId)}] ${escapeHtml(row.name)} (${escapeHtml(row.remaining)} disp.)</option>`).join('')}
            </select>
            <input type="text" name="clientOrEquipment" placeholder="Cliente o equipo" style="margin-top:8px;" />
            <button type="submit">Crear solicitud</button>
          </form>
          <form method="post" action="/admin/gspcare/renew" style="margin-top:12px;">
            <input type="hidden" name="cedula" value="${escapeHtml(gspCareMember.cedula)}" />
            <button type="submit" class="btn-secondary">Renovar membresía (reinicia bolsones, mantiene historial)</button>
          </form>
        </div>`;
              })()
            : ''
        }
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

const loadOffers = () => {
  try {
    const raw = fs.readFileSync(offersPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('No se pudo leer offers.json:', error?.message || error);
    return [];
  }
};

const saveOffers = (offers) => {
  try {
    fs.mkdirSync(path.dirname(offersPath), { recursive: true });
    fs.writeFileSync(offersPath, JSON.stringify(offers, null, 2));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('No se pudo guardar offers.json:', error?.message || error);
  }
};

const loadWeeklyProduct = () => {
  try {
    const raw = fs.readFileSync(weeklyProductPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('No se pudo leer weekly-product.json:', error?.message || error);
    return null;
  }
};

const saveWeeklyProduct = (product) => {
  try {
    fs.mkdirSync(path.dirname(weeklyProductPath), { recursive: true });
    fs.writeFileSync(weeklyProductPath, JSON.stringify(product, null, 2));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      'No se pudo guardar weekly-product.json:',
      error?.message || error
    );
  }
};

const loadBanners = () => {
  try {
    const raw = fs.readFileSync(bannersPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('No se pudo leer banners.json:', error?.message || error);
    return [];
  }
};

const saveBanners = (banners) => {
  try {
    fs.mkdirSync(path.dirname(bannersPath), { recursive: true });
    fs.writeFileSync(bannersPath, JSON.stringify(banners, null, 2));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('No se pudo guardar banners.json:', error?.message || error);
  }
};

const GSP_CARE_PLAN_MONTHS = { Basic: 3, Professional: 6, Premium: 12 };
const GSP_CARE_CATEGORY_IDS = ['A', 'B', 'C'];
const GSP_CARE_CATEGORIES = {
  A: { name: 'Hikvision/HiLook + Diagnóstico CCTV no PTZ', Basic: 10, Professional: 16, Premium: 32 },
  B: { name: 'ZKTeco/Honeywell', Basic: 2, Professional: 2, Premium: 3 },
  C: { name: 'Otros diagnósticos/plataformas', Basic: 1, Professional: 2, Premium: 3 },
};
const GSP_CARE_SERVICES = [
  { id: 'reset_hikvision', name: 'Reset contraseña equipo hikvision/hiklook', marca: 'Hikvision/HiLook', modalidad: 'Remoto', categoryId: 'A' },
  { id: 'flasheo_hikvision', name: 'Servicio flasheo Hikvision', marca: 'Hikvision', modalidad: 'Remoto', categoryId: 'A' },
  { id: 'desvinculacion_hikconnect', name: 'Desvinculacion cuenta HIK-CONNECT', marca: 'Hikvision', modalidad: 'Remoto', categoryId: 'A' },
  { id: 'firmware_hikvision', name: 'Actualizacion firmware equipo Hikvision/Hilook', marca: 'Hikvision/HiLook', modalidad: 'Remoto', categoryId: 'A' },
  { id: 'diagnostico_no_ptz', name: 'Diagnostico (no incluye PTZ) – grabador – camaras fuera de garantia', marca: 'Hikvision/HiLook', modalidad: 'Remoto', categoryId: 'A' },
  { id: 'reset_zkteco', name: 'Reset contraseña servidores Zkteco Biotime/Zkbiocvsecurity/Zkbiocvacces', marca: 'ZKTeco', modalidad: 'Remoto', categoryId: 'B' },
  { id: 'diagnostico_remoto_zkteco', name: 'Diagnostico Remoto Equipo fuera de Garantia (Zkbiocvacces Zkbiocvsecurity Biotime)', marca: 'ZKTeco', modalidad: 'Remoto', categoryId: 'B' },
  { id: 'parametrizacion_honeywell', name: 'Parametrizacion Lector Honeywell codigo de barras Zkbiocvsecurity modulo visitantes', marca: 'Honeywell/ZKTeco', modalidad: 'Remoto', categoryId: 'B' },
  { id: 'desvinculacion_dsc', name: 'Desvinculacion de equipo DSC plataforma Comunicadores', marca: 'DSC', modalidad: 'Remoto', categoryId: 'C' },
  { id: 'diagnostico_powermanage', name: 'Diagnostico remoto Servidor powermanage para instalacion powermanage', marca: 'Otros', modalidad: 'Remoto', categoryId: 'C' },
  { id: 'diagnostico_dsc', name: 'Diagnostico equipos marca DSC fuera de garantia', marca: 'DSC', modalidad: 'Remoto', categoryId: 'C' },
  { id: 'diagnostico_uhf', name: 'Diagnostico equipos marca UHF fuera de garantia', marca: 'UHF', modalidad: 'Remoto', categoryId: 'C' },
  { id: 'diagnostico_came', name: 'Diagnostico equipo marca CAME en sede fuera de garantia', marca: 'CAME', modalidad: 'En sede', categoryId: 'C' },
];

function getGspCareExpiresAt(activatedAt, plan) {
  if (!activatedAt || !plan) return null;
  const months = GSP_CARE_PLAN_MONTHS[plan];
  if (months == null) return null;
  const d = new Date(activatedAt);
  if (Number.isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function getGspCareCategoryLimitForPlan(categoryId, plan) {
  const cat = GSP_CARE_CATEGORIES[categoryId];
  if (!cat || !plan) return null;
  const key = plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase();
  if (key === 'Basic') return cat.Basic;
  if (key === 'Professional') return cat.Professional;
  if (key === 'Premium') return cat.Premium;
  return null;
}

function getGspCareServiceById(serviceId) {
  return GSP_CARE_SERVICES.find((s) => s.id === serviceId) || null;
}

function getGspCareCategoryRemaining(member, categoryId) {
  if (!member || !categoryId) return 0;
  const limit = getGspCareCategoryLimitForPlan(categoryId, member.plan);
  if (limit == null) return 0;
  const used = Number(member.periodConsumption?.[categoryId] ?? 0);
  return Math.max(0, limit - used);
}

function getGspCareLimitForPlan(service, plan) {
  if (!service || !service.categoryId) return null;
  return getGspCareCategoryLimitForPlan(service.categoryId, plan);
}

const defaultPeriodConsumption = () => ({ A: 0, B: 0, C: 0 });

const loadGspCare = () => {
  try {
    const raw = fs.readFileSync(gspCarePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          let cedula; let activatedAt; let plan; let expiresAt; let periodConsumption; let periodStart;
          if (typeof item === 'string') {
            cedula = normalizeId(item);
            activatedAt = null;
            plan = '';
          } else if (item && typeof item === 'object') {
            cedula = normalizeId(item.cedula || item.id || '');
            activatedAt = String(item.activatedAt || '').trim() || null;
            plan = String(item.plan || '').trim();
            expiresAt = String(item.expiresAt || '').trim() || null;
            periodStart = String(item.periodStart || item.activatedAt || '').trim() || null;
            const pc = item.periodConsumption && typeof item.periodConsumption === 'object' ? item.periodConsumption : {};
            periodConsumption = {
              A: Math.max(0, Number(pc.A) || 0),
              B: Math.max(0, Number(pc.B) || 0),
              C: Math.max(0, Number(pc.C) || 0),
            };
          } else {
            return null;
          }
          if (activatedAt && plan && !expiresAt) {
            expiresAt = getGspCareExpiresAt(activatedAt, plan);
          }
          if (!periodStart && activatedAt) periodStart = activatedAt;
          return {
            cedula,
            activatedAt,
            plan,
            expiresAt,
            periodStart: periodStart || activatedAt,
            periodConsumption: periodConsumption || defaultPeriodConsumption(),
          };
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

const loadGspCareRequests = () => {
  try {
    const raw = fs.readFileSync(gspCareRequestsPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('No se pudo leer gspcare-requests.json:', error?.message || error);
  }
  return [];
};

const saveGspCareRequests = (items) => {
  try {
    fs.mkdirSync(path.dirname(gspCareRequestsPath), { recursive: true });
    fs.writeFileSync(gspCareRequestsPath, JSON.stringify(items, null, 2));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('No se pudo guardar gspcare-requests.json:', error?.message || error);
  }
};

const isExpoPushToken = (token) =>
  typeof token === 'string' &&
  (token.startsWith('ExponentPushToken') || token.startsWith('ExpoPushToken'));

const loadPushTokens = () => {
  try {
    const raw = fs.readFileSync(pushTokensPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
};

const savePushTokens = (tokens) => {
  try {
    fs.mkdirSync(path.dirname(pushTokensPath), { recursive: true });
    fs.writeFileSync(pushTokensPath, JSON.stringify(tokens, null, 2));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('No se pudo guardar push-tokens.json:', error?.message || error);
  }
};

const upsertPushToken = ({ token, cedula, email, platform } = {}) => {
  if (!isExpoPushToken(token)) return null;
  const stored = loadPushTokens();
  const now = new Date().toISOString();
  const normalizedToken = String(token).trim();
  const index = stored.findIndex((item) => item?.token === normalizedToken);
  const payload = {
    token: normalizedToken,
    cedula: cedula ? normalizeId(cedula) : null,
    email: email ? String(email).trim().toLowerCase() : null,
    platform: platform ? String(platform).trim() : null,
    lastSeenAt: now,
  };
  if (index >= 0) {
    stored[index] = { ...stored[index], ...payload };
  } else {
    stored.push({ ...payload, createdAt: now });
  }
  savePushTokens(stored);
  return payload;
};

const loadCashbackRequests = () => {
  try {
    const raw = fs.readFileSync(cashbackRequestsPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
};

const saveCashbackRequests = (requests) => {
  try {
    fs.mkdirSync(path.dirname(cashbackRequestsPath), { recursive: true });
    fs.writeFileSync(cashbackRequestsPath, JSON.stringify(requests, null, 2));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('No se pudo guardar cashback-requests.json:', error?.message || error);
  }
};

const chunkArray = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const EXPO_PUSH_HEADERS = {
  Accept: 'application/json',
  'Accept-Encoding': 'gzip, deflate',
  'Content-Type': 'application/json',
};

const sendPushToCedula = async (cedula, { title, body, data } = {}) => {
  const stored = loadPushTokens();
  const norm = normalizeId(cedula);
  const tokens = stored
    .filter((item) => item?.cedula === norm && isExpoPushToken(item?.token))
    .map((item) => item.token);
  if (!tokens.length) {
    return { total: 0, sent: 0, failed: 0 };
  }
  const chunks = chunkArray(tokens, 100);
  let sent = 0;
  let failed = 0;
  for (const chunk of chunks) {
    const messages = chunk.map((token) => ({
      to: token,
      title: title || 'GSP Pro',
      body: body || '',
      sound: 'default',
      data: data && Object.keys(data).length ? data : {},
    }));
    try {
      const response = await axios.post(
        'https://exp.host/--/api/v2/push/send',
        messages,
        { headers: EXPO_PUSH_HEADERS, timeout: 15000 }
      );
      if (response.data?.errors?.length) {
        console.error('[push] Expo request errors:', response.data.errors);
        failed += messages.length;
        continue;
      }
      const results = Array.isArray(response.data?.data) ? response.data.data : [];
      results.forEach((result) => {
        if (result?.status === 'ok') {
          sent += 1;
        } else {
          failed += 1;
          if (result?.message) console.warn('[push] Expo ticket:', result.message);
        }
      });
    } catch (error) {
      failed += messages.length;
      console.error('[push] Expo request failed:', error?.message || error?.response?.data || error);
    }
  }
  return { total: tokens.length, sent, failed };
};

const sendPushNotifications = async ({ title, body, data } = {}) => {
  const stored = loadPushTokens();
  const tokens = stored.map((item) => item?.token).filter(isExpoPushToken);
  if (!tokens.length) {
    return { total: 0, sent: 0, failed: 0, receipts: [] };
  }
  const chunks = chunkArray(tokens, 100);
  let sent = 0;
  let failed = 0;
  const receipts = [];
  for (const chunk of chunks) {
    const messages = chunk.map((token) => ({
      to: token,
      title: title || 'GSP Pro',
      body: body || '',
      sound: 'default',
      data: data && Object.keys(data).length ? data : {},
    }));
    try {
      const response = await axios.post(
        'https://exp.host/--/api/v2/push/send',
        messages,
        { headers: EXPO_PUSH_HEADERS, timeout: 15000 }
      );
      if (response.data?.errors?.length) {
        console.error('[push] Expo request errors:', response.data.errors);
        failed += messages.length;
        receipts.push({ status: 'error', message: String(response.data.errors[0]?.message || 'Expo error') });
        continue;
      }
      const results = Array.isArray(response.data?.data) ? response.data.data : [];
      results.forEach((result) => {
        if (result?.status === 'ok') {
          sent += 1;
          receipts.push({ status: 'ok', id: result?.id || null });
        } else {
          failed += 1;
          receipts.push({ status: 'error', message: result?.message || 'Error' });
          if (result?.message) console.warn('[push] Expo ticket:', result.message);
        }
      });
    } catch (error) {
      failed += messages.length;
      const msg = error?.response?.data?.errors?.[0]?.message || error?.message || 'Error enviando notificación';
      receipts.push({ status: 'error', message: msg });
      console.error('[push] Expo request failed:', error?.message || error?.response?.data || error);
    }
  }
  return { total: tokens.length, sent, failed, receipts };
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

const getMsUntilLocalHour = (hour) => {
  const now = new Date();
  const target = new Date();
  target.setHours(hour, 0, 0, 0);
  if (now >= target) {
    target.setDate(target.getDate() + 1);
  }
  return Math.max(0, target.getTime() - now.getTime());
};

const scheduleDailyClientsRefresh = () => {
  const delay = getMsUntilLocalHour(8);
  setTimeout(() => {
    refreshClientsCache().catch((error) => {
      // eslint-disable-next-line no-console
      console.warn('No se pudo refrescar clients cache:', error?.message || error);
    });
    scheduleDailyClientsRefresh();
  }, delay);
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
        const { roles } = loadAdminUsers();
        req.adminUser = buildAdminSession({
          username: fixedUser,
          roleId: 'admin',
          roles,
          source: 'env',
        });
        return next();
      }
      res.setHeader('WWW-Authenticate', 'Basic realm="GSP Admin"');
      return res.status(401).send('Credenciales inválidas.');
    }

    const { users, roles } = loadAdminUsers();
    const normalizedUsername = String(credentials.username || '').trim().toLowerCase();
    const matchedUser = users.find(
      (user) => String(user.username || '').trim().toLowerCase() === normalizedUsername
    );
    if (matchedUser?.active) {
      const hashed = hashAdminPassword(credentials.password || '');
      if (hashed === matchedUser.passwordHash) {
        req.adminUser = buildAdminSession({
          username: matchedUser.username,
          roleId: matchedUser.roleId,
          roles,
          source: 'local',
        });
        return next();
      }
    }

    const login = await woo.login({
      email: credentials.username,
      password: credentials.password,
    });
    const token = login?.token;
    const profile = await woo.getWpUserMe(token);
    const wpRoles = Array.isArray(profile?.roles) ? profile.roles : [];
    if (!wpRoles.includes('administrator')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="GSP Admin"');
      return res.status(403).send('Acceso restringido.');
    }

    req.adminUser = buildAdminSession({
      username: credentials.username,
      roleId: 'admin',
      roles: loadAdminUsers().roles,
      source: 'wp',
    });
    return next();
  } catch (_error) {
    res.setHeader('WWW-Authenticate', 'Basic realm="GSP Admin"');
    return res.status(401).send('Credenciales inválidas.');
  }
};

const requireSectionPermission = (section) => (req, res, next) => {
  if (!req.adminUser) {
    return res.status(401).send('Autenticación requerida.');
  }
  if (canAccessSection(section, req.adminUser.permissions || [])) {
    return next();
  }
  return res.status(403).send('Acceso restringido.');
};

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

ensureDataFiles();
loadClientsCache();
ensureClientsCacheFresh().catch((error) => {
  // eslint-disable-next-line no-console
  console.warn('No se pudo refrescar clients cache:', error?.message || error);
});
scheduleDailyClientsRefresh();

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
  const roleId = String(req.query.roleId || '').trim();
  const userId = String(req.query.userId || '').trim();
  const section = String(req.query.section || 'inicio').trim() || 'inicio';
  const gspCareVerCedula = String(req.query.ver || '').trim();
  const gspCareError = String(req.query.error || '').trim();
  const refreshStatus = String(req.query.refresh || '').trim();
  const notificationStatus = String(req.query.notify || '').trim();
  const vendedorInput = String(req.query.vendedor || '').trim();
  const vendedor = vendedorInput || DEFAULT_CXC_VENDEDOR;
  const allowFallback =
    !vendedorInput || (DEFAULT_CXC_VENDEDOR && vendedorInput === DEFAULT_CXC_VENDEDOR);
  const rewards = loadRewards();
  const offers = loadOffers();
  const weeklyProduct = loadWeeklyProduct();
  const banners = loadBanners();
  const commercialTeamRaw = loadCommercialRaw();
  const commercialTeamCount = loadCommercialTeam().length;
  const { users: adminUsers, roles: adminRoles } = loadAdminUsers();
  const pushHistory = loadPushHistory();
  const allowedSections = allowedSectionsFor(req.adminUser?.permissions || []);
  if (!allowedSections.length) {
    return res.status(403).send('Acceso restringido.');
  }
  const safeSection = allowedSections.includes(section)
    ? section
    : allowedSections[0] || 'inicio';
  if (safeSection !== section) {
    return res.redirect(`/admin/rewards?section=${encodeURIComponent(safeSection)}`);
  }
  const gspCareList = loadGspCare();
  const pushTokensCount = loadPushTokens().length;
  const gspCareActive = cedula
    ? gspCareList.some((item) => item.cedula === normalizeId(cedula))
    : false;
  const editReward = editId
    ? rewards.find((reward) => String(reward.id) === editId) || null
    : null;
  const editRole = roleId
    ? adminRoles.find((role) => String(role.id) === roleId) || null
    : null;
  const editUser = userId
    ? adminUsers.find((user) => String(user.id) === userId) || null
    : null;
  const cashbackRequests = loadCashbackRequests();
  if (!cedula) {
    return res.send(
      renderRewardsPortal({
        rewards,
        offers,
        weeklyProduct,
        commercialTeamRaw,
        commercialTeamCount,
        adminUsers,
        adminRoles,
        editRole,
        editUser,
        pushHistory,
        allowedSections,
        editReward,
        gspCareList,
        gspCareActive,
        vendedor,
        vendedorInput,
        defaultVendedor: DEFAULT_CXC_VENDEDOR,
        section: safeSection,
        refreshStatus,
        notificationStatus,
        pushTokensCount,
        cashbackRequests,
        banners,
        gspCareVerCedula,
        gspCareError,
        gspCareServices: GSP_CARE_SERVICES,
      })
    );
  }

  const searchStart = Date.now();
  const [autoSeller, initialSearch, wooSummary] = await Promise.all([
    allowFallback ? findSellerFromCartera({ cedula }) : Promise.resolve(''),
    findClientInfo({ cedula, vendedor, useRemoteFallback: false }),
    getWooCustomerSummary(cedula),
  ]);
  const autoSearchStart = Date.now();
  const autoSearch = autoSeller
    ? await findClientInfo({ cedula, vendedor: autoSeller, useRemoteFallback: false })
    : null;
  const fallbackSearchStart = Date.now();
  const fallbackSearch = allowFallback
    ? await findClientInfo({ cedula, vendedor: '', useRemoteFallback: false })
    : null;
  const activeSearch = initialSearch?.info
    ? initialSearch
    : autoSearch?.info
      ? autoSearch
      : fallbackSearch || initialSearch;
  const clientInfo = activeSearch?.info || null;
  const searchTimings = {
    baseMs: Date.now() - searchStart,
    autoMs: autoSeller ? Date.now() - autoSearchStart : 0,
    fallbackMs: allowFallback ? Date.now() - fallbackSearchStart : 0,
  };

  try {
    const ventasStart = Date.now();
    const payload = await fetchVentasPayload({ cedula, chunkDays: 7 });
    const filteredPayload = filterVentasPayload(payload, cedula);
    const name = findValueByKeys(filteredPayload || payload, CLIENT_NAME_KEYS);
    const total = getVentasTotal(filteredPayload || payload);
    const ventasMs = Date.now() - ventasStart;
    const monthlyStart = Date.now();
    const monthlySummary = await buildVentasMonthlySummary({ cedula });
    const monthlyMs = Date.now() - monthlyStart;
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
        timings: {
          search: searchTimings,
          ventasMs,
          monthlyMs,
        },
        rewards,
        offers,
        weeklyProduct,
        commercialTeamRaw,
        commercialTeamCount,
        adminUsers,
        adminRoles,
        editRole,
        editUser,
        pushHistory,
        allowedSections,
        editReward,
        gspCareList,
        gspCareActive,
        vendedor,
        vendedorInput,
        defaultVendedor: DEFAULT_CXC_VENDEDOR,
        section: safeSection,
        refreshStatus,
        notificationStatus,
        pushTokensCount,
        cashbackRequests,
        banners,
        gspCareVerCedula,
        gspCareError,
        gspCareServices: GSP_CARE_SERVICES,
      })
    );
  } catch (error) {
    return res.send(
      renderRewardsPortal({
        cedula,
        error: error?.response?.data || error?.message || 'No se pudo calcular',
        rewards,
        offers,
        weeklyProduct,
        commercialTeamRaw,
        commercialTeamCount,
        adminUsers,
        adminRoles,
        editRole,
        editUser,
        pushHistory,
        allowedSections,
        editReward,
        gspCareList,
        gspCareActive,
        clientInfo,
        clientSearch: activeSearch,
        wooSummary,
        vendedor,
        vendedorInput,
        defaultVendedor: DEFAULT_CXC_VENDEDOR,
        section: safeSection,
        gspCareVerCedula,
        gspCareError,
        gspCareServices: GSP_CARE_SERVICES,
        timings: {
          search: searchTimings,
        },
        refreshStatus,
        notificationStatus,
        pushTokensCount,
        cashbackRequests,
        banners,
      })
    );
  }
});

app.post(
  '/admin/cashback/close',
  adminAuth,
  requireSectionPermission('solicitudes-cashback'),
  (req, res) => {
    const requestId = String(req.body?.requestId || '').trim();
    const ncNumber = String(req.body?.ncNumber || '').trim();
    const ncAmount = Math.max(0, Number(req.body?.ncAmount) || 0);
    const section = String(req.body?.section || 'solicitudes-cashback').trim() || 'solicitudes-cashback';
    if (!requestId || !ncNumber) {
      return res.redirect(`/admin/rewards?section=${encodeURIComponent(section)}&notify=error`);
    }
    const requests = loadCashbackRequests();
    const index = requests.findIndex((r) => r.id === requestId);
    if (index < 0) {
      return res.redirect(`/admin/rewards?section=${encodeURIComponent(section)}&notify=error`);
    }
    requests[index] = {
      ...requests[index],
      status: 'completed',
      ncNumber,
      ncAmount,
      completedAt: new Date().toISOString(),
    };
    saveCashbackRequests(requests);
    return res.redirect(`/admin/rewards?section=${encodeURIComponent(section)}&notify=closed`);
  }
);

app.post(
  '/admin/rewards/refresh-clients',
  adminAuth,
  requireSectionPermission('clientes'),
  async (req, res) => {
  const section = String(req.body?.section || 'clientes').trim() || 'clientes';
  try {
    await refreshClientsCache();
    return res.redirect(
      `/admin/rewards?section=${encodeURIComponent(section)}&refresh=ok`
    );
  } catch (_error) {
    return res.redirect(
      `/admin/rewards?section=${encodeURIComponent(section)}&refresh=error`
    );
  }
  }
);

app.post(
  '/admin/notifications/send',
  adminAuth,
  requireSectionPermission('notificaciones'),
  async (req, res) => {
  const section = String(req.body?.section || 'notificaciones').trim() || 'notificaciones';
  const title = String(req.body?.title || '').trim();
  const body = String(req.body?.body || '').trim();
  const url = String(req.body?.url || '').trim();
  if (!title || !body) {
    return res.redirect(`/admin/rewards?section=${encodeURIComponent(section)}&notify=error`);
  }
  try {
    const result = await sendPushNotifications({
      title,
      body,
      data: url ? { url } : {},
    });
    const status =
      result.failed === 0 ? 'enviado' : result.sent > 0 ? 'parcial' : 'fallido';
    recordPushHistory({
      title,
      body,
      sentBy: req.adminUser?.username || 'admin',
      sentAt: new Date().toISOString(),
      status,
      total: result.total,
      sent: result.sent,
      failed: result.failed,
    });
    return res.redirect(`/admin/rewards?section=${encodeURIComponent(section)}&notify=ok`);
  } catch (_error) {
    recordPushHistory({
      title,
      body,
      sentBy: req.adminUser?.username || 'admin',
      sentAt: new Date().toISOString(),
      status: 'fallido',
      total: 0,
      sent: 0,
      failed: 0,
    });
    return res.redirect(`/admin/rewards?section=${encodeURIComponent(section)}&notify=error`);
  }
  }
);

app.post(
  '/admin/rewards/save',
  adminAuth,
  requireSectionPermission('premios'),
  (req, res) => {
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
  }
);

app.post(
  '/admin/rewards/delete',
  adminAuth,
  requireSectionPermission('premios'),
  (req, res) => {
  const { id, section } = req.body || {};
  if (!id) {
    return res.redirect('/admin/rewards?section=premios');
  }
  const rewards = loadRewards();
  const filtered = rewards.filter((reward) => reward.id !== id);
  saveRewards(filtered);
  const targetSection = section || 'premios';
  return res.redirect(`/admin/rewards?section=${encodeURIComponent(targetSection)}`);
  }
);

app.post(
  '/admin/gspcare/save',
  adminAuth,
  requireSectionPermission('gsp-care'),
  (req, res) => {
  const { cedula, section, plan } = req.body || {};
  const normalized = normalizeId(cedula);
  if (!normalized) {
    return res.redirect('/admin/rewards?section=gsp-care');
  }
  const current = loadGspCare();
  const today = new Date().toISOString().slice(0, 10);
  const nextPlan = String(plan || '').trim();
  const existingIndex = current.findIndex((item) => item.cedula === normalized);
  if (existingIndex >= 0) {
    const existing = current[existingIndex];
    const nextActivatedAt = existing.activatedAt || today;
    const nextExpiresAt = getGspCareExpiresAt(nextActivatedAt, nextPlan || existing.plan);
    current[existingIndex] = {
      ...existing,
      activatedAt: nextActivatedAt,
      plan: nextPlan || existing.plan || '',
      expiresAt: nextExpiresAt || existing.expiresAt,
      periodStart: existing.periodStart || nextActivatedAt,
      periodConsumption: existing.periodConsumption || defaultPeriodConsumption(),
    };
  } else {
    const expiresAt = getGspCareExpiresAt(today, nextPlan);
    current.unshift({
      cedula: normalized,
      activatedAt: today,
      plan: nextPlan,
      expiresAt,
      periodStart: today,
      periodConsumption: defaultPeriodConsumption(),
    });
  }
  saveGspCare(current);
  const targetSection = section || 'gsp-care';
  return res.redirect(`/admin/rewards?section=${encodeURIComponent(targetSection)}`);
  }
);

app.post(
  '/admin/gspcare/request/create',
  adminAuth,
  requireSectionPermission('gsp-care'),
  (req, res) => {
    const { cedula, serviceId, clientOrEquipment, section } = req.body || {};
    const normalized = normalizeId(cedula);
    if (!normalized || !serviceId) {
      return res.redirect(`/admin/rewards?section=gsp-care&ver=${encodeURIComponent(normalized || '')}&error=missing`);
    }
    const member = loadGspCare().find((item) => item.cedula === normalized);
    if (!member) {
      return res.redirect(`/admin/rewards?section=gsp-care&ver=${encodeURIComponent(normalized)}&error=no-member`);
    }
    const service = getGspCareServiceById(serviceId);
    if (!service) {
      return res.redirect(`/admin/rewards?section=gsp-care&ver=${encodeURIComponent(normalized)}&error=invalid-service`);
    }
    const remaining = getGspCareCategoryRemaining(member, service.categoryId);
    if (remaining <= 0) {
      return res.redirect(`/admin/rewards?section=gsp-care&ver=${encodeURIComponent(normalized)}&error=cupo-agotado`);
    }
    const requests = loadGspCareRequests();
    const now = new Date().toISOString();
    const newRequest = {
      id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      cedula: normalized,
      serviceId: service.id,
      serviceName: service.name,
      brand: service.marca,
      modality: service.modalidad,
      date: now.slice(0, 10),
      clientOrEquipment: String(clientOrEquipment || '').trim() || '—',
      status: 'pending',
      createdAt: now,
    };
    requests.unshift(newRequest);
    saveGspCareRequests(requests);
    return res.redirect(`/admin/rewards?section=gsp-care&ver=${encodeURIComponent(normalized)}`);
  }
);

app.post(
  '/admin/gspcare/request/complete',
  adminAuth,
  requireSectionPermission('gsp-care'),
  (req, res) => {
    const { requestId, section } = req.body || {};
    if (!requestId) {
      return res.redirect(`/admin/rewards?section=gsp-care&error=missing-request`);
    }
    const requests = loadGspCareRequests();
    const reqIndex = requests.findIndex((r) => r.id === requestId);
    if (reqIndex < 0) {
      return res.redirect(`/admin/rewards?section=gsp-care&error=not-found`);
    }
    const servReq = requests[reqIndex];
    if (servReq.status === 'completed') {
      return res.redirect(`/admin/rewards?section=gsp-care&ver=${encodeURIComponent(servReq.cedula)}&error=already-completed`);
    }
    const cedula = servReq.cedula;
    const current = loadGspCare();
    const memberIndex = current.findIndex((item) => item.cedula === cedula);
    if (memberIndex < 0) {
      return res.redirect(`/admin/rewards?section=gsp-care&ver=${encodeURIComponent(cedula)}&error=no-member`);
    }
    const member = current[memberIndex];
    const service = getGspCareServiceById(servReq.serviceId);
    if (!service) {
      return res.redirect(`/admin/rewards?section=gsp-care&ver=${encodeURIComponent(cedula)}&error=invalid-service`);
    }
    const categoryId = service.categoryId;
    const remaining = getGspCareCategoryRemaining(member, categoryId);
    if (remaining <= 0) {
      return res.redirect(`/admin/rewards?section=gsp-care&ver=${encodeURIComponent(cedula)}&error=cupo-agotado`);
    }
    const periodConsumption = { ...(member.periodConsumption || defaultPeriodConsumption()) };
    periodConsumption[categoryId] = (periodConsumption[categoryId] || 0) + 1;
    current[memberIndex] = { ...member, periodConsumption };
    saveGspCare(current);
    const now = new Date().toISOString();
    requests[reqIndex] = {
      ...servReq,
      status: 'completed',
      eventConsumed: 1,
      categoryId,
      planId: member.plan,
      completedAt: now,
      periodId: member.periodStart,
    };
    saveGspCareRequests(requests);
    return res.redirect(`/admin/rewards?section=gsp-care&ver=${encodeURIComponent(cedula)}`);
  }
);

app.post(
  '/admin/gspcare/renew',
  adminAuth,
  requireSectionPermission('gsp-care'),
  (req, res) => {
    const { cedula, section } = req.body || {};
    const normalized = normalizeId(cedula);
    if (!normalized) {
      return res.redirect(`/admin/rewards?section=gsp-care`);
    }
    const current = loadGspCare();
    const index = current.findIndex((item) => item.cedula === normalized);
    if (index < 0) {
      return res.redirect(`/admin/rewards?section=gsp-care&ver=${encodeURIComponent(normalized)}`);
    }
    const member = current[index];
    const today = new Date().toISOString().slice(0, 10);
    const newPeriodStart = today;
    const newExpiresAt = getGspCareExpiresAt(newPeriodStart, member.plan);
    current[index] = {
      ...member,
      activatedAt: newPeriodStart,
      expiresAt: newExpiresAt,
      periodStart: newPeriodStart,
      periodConsumption: defaultPeriodConsumption(),
    };
    saveGspCare(current);
    return res.redirect(`/admin/rewards?section=gsp-care&ver=${encodeURIComponent(normalized)}`);
  }
);

app.post(
  '/admin/gspcare/delete',
  adminAuth,
  requireSectionPermission('gsp-care'),
  (req, res) => {
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
  }
);

app.post(
  '/admin/comercial/save',
  adminAuth,
  requireSectionPermission('comercial'),
  (req, res) => {
  const section = String(req.body?.section || 'comercial').trim() || 'comercial';
  const csv = String(req.body?.csv || '').trim();
  if (!saveCommercialRaw(csv)) {
    return res.redirect(`/admin/rewards?section=${encodeURIComponent(section)}&save=error`);
  }
  return res.redirect(`/admin/rewards?section=${encodeURIComponent(section)}&save=ok`);
  }
);

app.post(
  '/admin/roles/save',
  adminAuth,
  requireSectionPermission('usuarios'),
  (req, res) => {
    const section = String(req.body?.section || 'usuarios').trim() || 'usuarios';
    const id = String(req.body?.id || '').trim();
    const name = String(req.body?.name || '').trim();
    const permissionsRaw = req.body?.permissions;
    const permissionsList = Array.isArray(permissionsRaw)
      ? permissionsRaw
      : permissionsRaw
        ? [permissionsRaw]
        : [];
    const permissions = permissionsList.filter((item) => ADMIN_SECTIONS.includes(item));
    if (!name) {
      return res.redirect(`/admin/rewards?section=${encodeURIComponent(section)}`);
    }
    const state = loadAdminUsers();
    const roleId =
      id ||
      normalizeField(name).slice(0, 24) ||
      `role-${Date.now().toString(36)}`;
    const existingIndex = state.roles.findIndex((role) => role.id === roleId);
    if (roleId === 'admin') {
      state.roles = state.roles.map((role) =>
        role.id === 'admin' ? { ...role, name: 'Administrador', permissions } : role
      );
    } else if (existingIndex >= 0) {
      state.roles[existingIndex] = {
        ...state.roles[existingIndex],
        name,
        permissions,
      };
    } else {
      state.roles.push({ id: roleId, name, permissions });
    }
    saveAdminUsers(state);
    return res.redirect(`/admin/rewards?section=${encodeURIComponent(section)}`);
  }
);

app.post(
  '/admin/roles/delete',
  adminAuth,
  requireSectionPermission('usuarios'),
  (req, res) => {
    const section = String(req.body?.section || 'usuarios').trim() || 'usuarios';
    const id = String(req.body?.id || '').trim();
    if (!id || id === 'admin') {
      return res.redirect(`/admin/rewards?section=${encodeURIComponent(section)}`);
    }
    const state = loadAdminUsers();
    state.roles = state.roles.filter((role) => role.id !== id);
    state.users = state.users.map((user) =>
      user.roleId === id ? { ...user, roleId: 'admin' } : user
    );
    saveAdminUsers(state);
    return res.redirect(`/admin/rewards?section=${encodeURIComponent(section)}`);
  }
);

app.post(
  '/admin/users/save',
  adminAuth,
  requireSectionPermission('usuarios'),
  (req, res) => {
    const section = String(req.body?.section || 'usuarios').trim() || 'usuarios';
    const id = String(req.body?.id || '').trim();
    const username = String(req.body?.username || '').trim();
    const roleId = String(req.body?.roleId || '').trim();
    const password = String(req.body?.password || '').trim();
    const active = Boolean(req.body?.active);
    if (!username || !roleId) {
      return res.redirect(`/admin/rewards?section=${encodeURIComponent(section)}`);
    }
    const state = loadAdminUsers();
    const normalizedUsername = username.toLowerCase();
    const existingUser = state.users.find(
      (user) => String(user.username || '').trim().toLowerCase() === normalizedUsername
    );
    if (!id && existingUser) {
      return res.redirect(`/admin/rewards?section=${encodeURIComponent(section)}&user=exists`);
    }
    if (id) {
      const index = state.users.findIndex((user) => user.id === id);
      if (index >= 0) {
        state.users[index] = {
          ...state.users[index],
          username,
          roleId,
          active,
          passwordHash: password ? hashAdminPassword(password) : state.users[index].passwordHash,
          updatedAt: new Date().toISOString(),
        };
      }
    } else {
      state.users.push({
        id: `user-${Date.now().toString(36)}`,
        username,
        roleId,
        active,
        passwordHash: hashAdminPassword(password),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    saveAdminUsers(state);
    return res.redirect(`/admin/rewards?section=${encodeURIComponent(section)}`);
  }
);

app.post(
  '/admin/users/delete',
  adminAuth,
  requireSectionPermission('usuarios'),
  (req, res) => {
    const section = String(req.body?.section || 'usuarios').trim() || 'usuarios';
    const id = String(req.body?.id || '').trim();
    if (!id) {
      return res.redirect(`/admin/rewards?section=${encodeURIComponent(section)}`);
    }
    const state = loadAdminUsers();
    state.users = state.users.filter((user) => user.id !== id);
    saveAdminUsers(state);
    return res.redirect(`/admin/rewards?section=${encodeURIComponent(section)}`);
  }
);

app.post(
  '/admin/offers/save',
  adminAuth,
  requireSectionPermission('ofertas'),
  (req, res) => {
  const { title, subtitle, price, image, searchQuery, cta, section } = req.body || {};
  if (!title) {
    return res.redirect('/admin/rewards?section=ofertas');
  }
  const offers = loadOffers();
  offers.unshift({
    id: `${Date.now()}`,
    title: String(title).trim(),
    subtitle: String(subtitle || '').trim(),
    price: String(price || '').trim(),
    image: String(image || '').trim(),
    searchQuery: String(searchQuery || '').trim(),
    cta: String(cta || '').trim(),
  });
  saveOffers(offers);
  const targetSection = section || 'ofertas';
  return res.redirect(`/admin/rewards?section=${encodeURIComponent(targetSection)}`);
  }
);

app.post(
  '/admin/offers/delete',
  adminAuth,
  requireSectionPermission('ofertas'),
  (req, res) => {
  const { id, section } = req.body || {};
  if (!id) {
    return res.redirect('/admin/rewards?section=ofertas');
  }
  const offers = loadOffers().filter((offer) => String(offer.id) !== String(id));
  saveOffers(offers);
  const targetSection = section || 'ofertas';
  return res.redirect(`/admin/rewards?section=${encodeURIComponent(targetSection)}`);
  }
);

app.post(
  '/admin/banners/save',
  adminAuth,
  requireSectionPermission('banners'),
  (req, res) => {
    const { imageUrl, link, section } = req.body || {};
    if (!imageUrl || !String(imageUrl).trim()) {
      return res.redirect('/admin/rewards?section=banners');
    }
    const banners = loadBanners();
    banners.push({
      id: `banner-${Date.now()}`,
      imageUrl: String(imageUrl).trim(),
      link: String(link || '').trim() || undefined,
    });
    saveBanners(banners);
    return res.redirect(`/admin/rewards?section=${encodeURIComponent(section || 'banners')}`);
  }
);

app.post(
  '/admin/banners/delete',
  adminAuth,
  requireSectionPermission('banners'),
  (req, res) => {
    const { id, section } = req.body || {};
    if (!id) {
      return res.redirect('/admin/rewards?section=banners');
    }
    const banners = loadBanners().filter((b) => String(b.id) !== String(id));
    saveBanners(banners);
    return res.redirect(`/admin/rewards?section=${encodeURIComponent(section || 'banners')}`);
  }
);

app.post(
  '/admin/weekly/save',
  adminAuth,
  requireSectionPermission('producto-semana'),
  (req, res) => {
  const { title, subtitle, price, image, searchQuery, cta, section } = req.body || {};
  if (!title) {
    return res.redirect('/admin/rewards?section=producto-semana');
  }
  const payload = {
    title: String(title).trim(),
    subtitle: String(subtitle || '').trim(),
    price: String(price || '').trim(),
    image: String(image || '').trim(),
    searchQuery: String(searchQuery || '').trim(),
    cta: String(cta || '').trim(),
  };
  saveWeeklyProduct(payload);
  const targetSection = section || 'producto-semana';
  return res.redirect(`/admin/rewards?section=${encodeURIComponent(targetSection)}`);
  }
);

app.get('/api/rewards', (_req, res) => {
  const rewards = loadRewards();
  return res.json({ rewards });
});

app.post('/api/push/register', (req, res) => {
  const { token, cedula, email, platform } = req.body || {};
  if (!token) {
    return res.status(400).json({ error: 'token es requerido' });
  }
  const saved = upsertPushToken({ token, cedula, email, platform });
  if (!saved) {
    return res.status(400).json({ error: 'token inválido' });
  }
  const total = loadPushTokens().length;
  console.log('[push] Token registrado. Total tokens:', total, 'cedula:', cedula || '(sin cédula)');
  return res.json({ ok: true });
});

app.post('/api/cashback/request', async (req, res) => {
  const { cedula, amount } = req.body || {};
  const norm = normalizeId(cedula);
  if (!norm) {
    return res.status(400).json({ error: 'cédula es requerida' });
  }
  const monto = Math.max(0, Number(amount) || 0);
  const requests = loadCashbackRequests();
  const id = `cb-${Date.now()}-${norm.slice(-4)}`;
  const request = {
    id,
    cedula: norm,
    amount: monto,
    status: 'pending',
    createdAt: new Date().toISOString(),
    ncNumber: null,
    ncAmount: null,
    completedAt: null,
  };
  requests.unshift(request);
  saveCashbackRequests(requests);
  try {
    await sendPushToCedula(norm, {
      title: 'Solicitud de cashback',
      body:
        'Tu solicitud será validada y recibirás vía correo la NC correspondiente al cashback solicitado.',
      data: { screen: 'Rewards' },
    });
  } catch (_err) {
    // no bloquear respuesta si falla el push
  }
  return res.json({ ok: true, requestId: id });
});

app.get('/api/home/offers', (_req, res) => {
  const offers = loadOffers();
  return res.json({ offers });
});

app.get('/api/home/banners', (_req, res) => {
  const banners = loadBanners();
  return res.json({ banners });
});

app.get('/api/home/weekly', (_req, res) => {
  const product = loadWeeklyProduct();
  return res.json({ product });
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

const buildWooUserResponse = ({ data, profile, customer }) => {
  const metaData = normalizeMetaList(customer?.meta_data);
  const metaKeys = [
    'gsp_nit',
    'gsp_cedula',
    'gsp_cedula_nit',
    'billing_cedula',
    'billing_nit',
    'cedula',
    'nit',
    'identificacion',
    'documento',
  ];
  const metaCedula = findWooMetaValue(metaData, metaKeys);
  const companyKeys = ['gsp_company', 'company', 'company_name', 'razon_social', 'razonsocial'];
  const metaCompany = findWooMetaValue(metaData, companyKeys);
  const cedula = normalizeId(metaCedula || (customer ? woo.getCustomerCedula(customer) : null));
  const billing = customer?.billing || {};
  const shipping = customer?.shipping || {};
  const gspPhone = metaData.find(
    (meta) => String(meta?.key || '').toLowerCase() === 'gsp_phone'
  )?.value;
  const phone = String(gspPhone || billing.phone || shipping.phone || '').trim();
  const billingFirst = customer?.billing?.first_name || '';
  const billingLast = customer?.billing?.last_name || '';
  const firstName = billingFirst || profile?.first_name || '';
  const lastName = billingLast || profile?.last_name || '';
  const fullName =
    `${firstName} ${lastName}`.trim() ||
    profile?.name ||
    data?.user_display_name ||
    '';
  const profileMeta = [
    ...normalizeMetaList(profile?.meta_data),
    ...normalizeMetaList(profile?.meta),
  ];
  const profileCedula = findWooMetaValue(profileMeta, metaKeys);
  const profileCompany = findWooMetaValue(profileMeta, companyKeys);
  const resolvedCedula = normalizeId(cedula || profileCedula || '');
  const resolvedCompany = String(metaCompany || profileCompany || '').trim();
  return {
    token: data?.token,
    user: {
      id: data?.user_id || profile?.id,
      email: data?.user_email || profile?.email,
      name: data?.user_display_name || profile?.name,
      firstName,
      lastName,
      fullName,
      nicename: data?.user_nicename || profile?.slug || profile?.nicename,
      customerId: customer?.id || null,
      cedula: resolvedCedula || null,
      company: resolvedCompany || null,
      phone,
    },
  };
};

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
    return res.json(buildWooUserResponse({ data, profile, customer }));
  } catch (error) {
    return res.status(401).json({
      error: 'Credenciales inválidas',
      details: error?.response?.data || error?.message,
    });
  }
});

app.post('/api/woo/session', async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || '');
    const token =
      req.body?.token ||
      (authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7) : '');
    if (!token) {
      return res.status(400).json({ error: 'token es requerido' });
    }
    const profile = await woo.getWpUserMe(token);
    const email = profile?.email || profile?.user_email;
    if (!email) {
      return res.status(404).json({ error: 'No se encontró email en el perfil' });
    }
    let customer = null;
    try {
      customer = await woo.findCustomerByEmail(email);
    } catch (_error) {
      customer = null;
    }
    const data = {
      token,
      user_id: profile?.id,
      user_email: email,
      user_display_name: profile?.name,
      user_nicename: profile?.slug || profile?.nicename,
    };
    return res.json(buildWooUserResponse({ data, profile, customer }));
  } catch (error) {
    return res.status(401).json({
      error: 'Sesión inválida',
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

    const shouldSearchByEmail = normalizedEmail && !resolvedCustomerId;
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

    const shouldSearchByCedula = normalizedCedula && !resolvedCustomerId;
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

const CARTERA_SUMMARY_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutos
const carteraSummaryCache = new Map();

const getCarteraSummaryCacheKey = (cedula, vendedor) =>
  `${normalizeId(cedula)}:${String(vendedor || '').trim()}`;

app.get('/api/cxc/estado-cartera/summary', async (req, res) => {
  try {
    const { cedula, vendedor, debug } = req.query;
    if (!cedula) {
      return res.status(400).json({ error: 'cedula es requerida' });
    }
    const normCedula = normalizeId(cedula);
    const resolvedSeller = vendedor || (await resolveSellerFromClients(cedula));
    if (!debug) {
      const cacheKey = getCarteraSummaryCacheKey(normCedula, resolvedSeller);
      const cached = carteraSummaryCache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        return res.json(cached.payload);
      }
    }
    const fecha = formatDateTimeNow();
    const data = await cxc.estadoCartera({
      fecha,
      cedula,
      vendedor: resolvedSeller || undefined,
    });
    if (debug) {
      return res.json(data);
    }
    const payload = parseMaybeJson(data.result ?? data.response ?? data.parsed ?? {});
    let cupoCredito = parseCarteraNumber(
      findValueByKeys(payload, CARTERA_CUPO_KEYS)
    );
    let saldoCartera = parseCarteraNumber(
      findValueByKeys(payload, CARTERA_SALDO_KEYS)
    );
    let saldoPorVencer = parseCarteraNumber(
      findValueByKeys(payload, CARTERA_POR_VENCER_KEYS)
    );
    let saldoVencido = parseCarteraNumber(
      findValueByKeys(payload, CARTERA_VENCIDO_KEYS)
    );
    if (Array.isArray(payload)) {
      const totals = payload.reduce(
        (acc, item) => {
          const saldo = parseCarteraNumber(
            findValueByKeys(item, CARTERA_SALDO_KEYS) || item?.SALDO
          );
          const daysRaw =
            findValueByKeys(item, [
              'daiaven',
              'diasvenc',
              'dias_venc',
              'dias_vencimiento',
              'diasvencido',
              'dias_vencido',
            ]) || item?.DAIAVEN;
          const dias = Number(daysRaw || 0);
          acc.saldoCartera += saldo;
          if (dias > 0) {
            acc.saldoVencido += saldo;
          } else {
            acc.saldoPorVencer += saldo;
          }
          return acc;
        },
        { saldoCartera: 0, saldoPorVencer: 0, saldoVencido: 0 }
      );
      if (totals.saldoCartera > 0) {
        saldoCartera = totals.saldoCartera;
      }
      if (totals.saldoPorVencer > 0 || totals.saldoVencido > 0) {
        saldoPorVencer = totals.saldoPorVencer;
        saldoVencido = totals.saldoVencido;
      }
    }
    if (!cupoCredito) {
      const cachedClient = await findClientInfo({
        cedula,
        vendedor: resolvedSeller || '',
        useRemoteFallback: false,
      });
      const cachedCupo = parseCarteraNumber(cachedClient?.info?.cupo);
      if (cachedCupo) {
        cupoCredito = cachedCupo;
      } else {
        const remoteClient = await findClientInfo({
          cedula,
          vendedor: resolvedSeller || '',
          useRemoteFallback: true,
        });
        const remoteCupo = parseCarteraNumber(remoteClient?.info?.cupo);
        if (remoteCupo) {
          cupoCredito = remoteCupo;
        }
      }
    }
    const summaryPayload = {
      cupoCredito,
      saldoCartera,
      saldoPorVencer,
      saldoVencido,
    };
    if (!debug) {
      const cacheKey = getCarteraSummaryCacheKey(normCedula, resolvedSeller);
      carteraSummaryCache.set(cacheKey, {
        payload: summaryPayload,
        expiresAt: Date.now() + CARTERA_SUMMARY_CACHE_TTL_MS,
      });
      if (carteraSummaryCache.size > 500) {
        const now = Date.now();
        for (const [k, v] of carteraSummaryCache.entries()) {
          if (v.expiresAt < now) carteraSummaryCache.delete(k);
        }
      }
    }
    return res.json(summaryPayload);
  } catch (error) {
    return res.status(500).json({
      error: 'No se pudo consultar estado de cartera',
      details: error?.response?.data || error?.message,
    });
  }
});

app.get('/api/cxc/comercial', async (req, res) => {
  try {
    const { cedula, vendedor } = req.query;
    if (!cedula && !vendedor) {
      return res.status(400).json({ error: 'cedula o vendedor es requerido' });
    }
    const resolvedSeller = String(
      vendedor || (cedula ? await resolveSellerFromClients(cedula) : '') || ''
    ).trim();
    if (!resolvedSeller) {
      return res.json({ seller: '', contacts: [] });
    }
    const team = loadCommercialTeam();
    const sellerId = normalizeSellerId(resolvedSeller);
    const sellerIdKey = sellerId ? stripLeadingZeros(sellerId) : '';
    const sellerKey = normalizeSellerName(resolvedSeller);
    let contacts = team;
    if (sellerId) {
      contacts = contacts.filter(
        (item) => item.vendorId === sellerId || item.vendorIdKey === sellerIdKey
      );
    }
    if (!contacts.length && sellerKey) {
      contacts = team.filter((item) => item.vendorKey === sellerKey);
    }
    contacts = contacts
      .map(({ name, phone, email, city, vendor, image, vendorId, vendorIdKey }) => {
        const photo =
          image ||
          COMMERCIAL_PHOTOS_BY_ID[vendorId] ||
          COMMERCIAL_PHOTOS_BY_ID[vendorIdKey] ||
          '';
        return {
          name,
          phone,
          email,
          city,
          vendor,
          image: photo,
        };
      });
    return res.json({ seller: resolvedSeller, contacts });
  } catch (error) {
    return res.status(500).json({
      error: 'No se pudo consultar comercial asignado',
      details: error?.message,
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
    const normalizedId = normalizeId(query);
    const normalizedText = normalizeSearchText(query);
    if (!normalizedId && !normalizedText) {
      return res.json([]);
    }
    const results = [];
    const seen = new Set();
    if (normalizedId) {
      for (const [cedula, info] of Object.entries(clientsCache.clients)) {
        if (!cedula.startsWith(normalizedId)) continue;
        results.push({
          cedula,
          name: info?.name || '',
        });
        seen.add(cedula);
        if (results.length >= 8) break;
      }
    }
    if (normalizedText && results.length < 8) {
      for (const [cedula, info] of Object.entries(clientsCache.clients)) {
        if (results.length >= 8) break;
        if (seen.has(cedula)) continue;
        const name = String(info?.name || '').trim();
        if (!name) continue;
        if (!normalizeSearchText(name).includes(normalizedText)) continue;
        results.push({ cedula, name });
        seen.add(cedula);
      }
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

    let chunkDays = 7;
    let data = null;
    try {
      data = await cxc.generarInfoVentas(callParams);
      if (debug) {
        return res.json(data);
      }
      if (isCxcFunctionInactive(data?.xml)) {
        return res.status(502).json({
          error:
            'CxC respondió "Función no activa" para GenerarInfoVentas. Solicita al proveedor habilitar el método.',
        });
      }
    } catch (error) {
      if (isMaxJsonError(error)) {
        chunkDays = 1;
      } else {
        throw error;
      }
    }

    const payload = await fetchVentasPayload({ cedula, fecha, chunkDays });
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
    let companyName = String(name || '').trim();
    if (cedula) {
      const clientInfo = await findClientInfo({
        cedula,
        vendedor: '',
        useRemoteFallback: true,
      });
      const clientName = String(clientInfo?.info?.name || '').trim();
      if (clientName) {
        companyName = clientName;
      }
    }
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
    const gspCareList = loadGspCare();
    const gspCareEntry = cedula
      ? gspCareList.find((item) => item.cedula === normalizeId(cedula))
      : null;
    const gspCareActive = Boolean(gspCareEntry);

    return res.json({
      nit: normalizeId(cedula || idValue),
      name,
      companyName: companyName || null,
      total,
      cashback,
      points,
      level,
      rebate,
      gspCare: gspCareActive,
      gspCarePlan: gspCareEntry?.plan || null,
      divisor: divisorValue,
      totalKey: keyToUse,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'No se pudo calcular cashback desde CxC',
      details: error?.response?.data || error?.message,
    });
  }
});

app.get('/api/gspcare/catalog', (_req, res) => {
  try {
    const categories = GSP_CARE_CATEGORY_IDS.map((catId) => {
      const cat = GSP_CARE_CATEGORIES[catId];
      return {
        id: catId,
        name: cat?.name || catId,
        Basic: cat?.Basic ?? null,
        Professional: cat?.Professional ?? null,
        Premium: cat?.Premium ?? null,
      };
    });
    const services = GSP_CARE_SERVICES.map((s) => ({
      id: s.id,
      name: s.name,
      categoryId: s.categoryId,
      marca: s.marca,
      modalidad: s.modalidad,
    }));
    return res.json({ categories, services });
  } catch (error) {
    return res.status(500).json({
      error: 'No se pudo cargar el catálogo',
      details: error?.message,
    });
  }
});

app.get('/api/gspcare/status', (req, res) => {
  try {
    const cedula = normalizeId(req.query.cedula || '');
    if (!cedula) {
      return res.status(400).json({ error: 'cedula es requerida' });
    }
    const list = loadGspCare();
    const member = list.find((item) => item.cedula === cedula);
    const todayStr = new Date().toISOString().slice(0, 10);
    if (!member) {
      return res.json({
        active: false,
        plan: null,
        activatedAt: null,
        expiresAt: null,
        isExpired: false,
        services: [],
      });
    }
    const expiresAt = member.expiresAt || getGspCareExpiresAt(member.activatedAt, member.plan);
    const isExpired = expiresAt && expiresAt < todayStr;
    const categories = GSP_CARE_CATEGORY_IDS.map((catId) => {
      const limit = getGspCareCategoryLimitForPlan(catId, member.plan);
      const used = Number(member.periodConsumption?.[catId] ?? 0);
      const remaining = limit == null ? null : Math.max(0, limit - used);
      return {
        id: catId,
        name: GSP_CARE_CATEGORIES[catId]?.name || catId,
        limit,
        used,
        remaining,
      };
    });
    const services = GSP_CARE_SERVICES.map((svc) => {
      const limit = getGspCareLimitForPlan(svc, member.plan);
      const remaining = getGspCareCategoryRemaining(member, svc.categoryId);
      return {
        id: svc.id,
        name: svc.name,
        categoryId: svc.categoryId,
        marca: svc.marca,
        modalidad: svc.modalidad,
        limit,
        remaining: limit == null ? 'Ilimitado' : remaining,
      };
    });
    return res.json({
      active: !isExpired,
      plan: member.plan,
      activatedAt: member.activatedAt,
      expiresAt,
      isExpired,
      categories,
      services,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'No se pudo consultar estado GSP Care',
      details: error?.message,
    });
  }
});

app.get('/api/gspcare/requests', (req, res) => {
  try {
    const cedula = normalizeId(req.query.cedula || '');
    if (!cedula) {
      return res.status(400).json({ error: 'cedula es requerida' });
    }
    const list = loadGspCareRequests();
    const requests = list.filter((r) => r.cedula === cedula);
    return res.json({ requests });
  } catch (error) {
    return res.status(500).json({
      error: 'No se pudieron listar las solicitudes',
      details: error?.message,
    });
  }
});

app.post('/api/gspcare/request', (req, res) => {
  try {
    const { cedula, serviceId, clientOrEquipment } = req.body || {};
    const normalized = normalizeId(cedula);
    if (!normalized) {
      return res.status(400).json({ error: 'cedula es requerida' });
    }
    if (!serviceId || typeof serviceId !== 'string') {
      return res.status(400).json({ error: 'serviceId es requerido' });
    }
    const member = loadGspCare().find((item) => item.cedula === normalized);
    if (!member) {
      return res.status(404).json({ error: 'No tienes membresía GSP Care activa' });
    }
    const service = getGspCareServiceById(serviceId.trim());
    if (!service) {
      return res.status(400).json({ error: 'Servicio no válido' });
    }
    const remaining = getGspCareCategoryRemaining(member, service.categoryId);
    if (remaining <= 0) {
      return res.status(400).json({ error: 'No tienes cupo disponible para este servicio en el período actual' });
    }
    const requests = loadGspCareRequests();
    const now = new Date().toISOString();
    const newRequest = {
      id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      cedula: normalized,
      serviceId: service.id,
      serviceName: service.name,
      brand: service.marca,
      modality: service.modalidad,
      date: now.slice(0, 10),
      clientOrEquipment: String(clientOrEquipment || '').trim() || '—',
      status: 'pending',
      createdAt: now,
    };
    requests.unshift(newRequest);
    saveGspCareRequests(requests);
    return res.json({ ok: true, request: newRequest });
  } catch (error) {
    return res.status(500).json({
      error: 'No se pudo crear la solicitud',
      details: error?.message,
    });
  }
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listo en http://localhost:${port}`);
});
