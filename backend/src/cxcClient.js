import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';

const {
  CXC_API_URL,
  CXC_VENTAS_URL,
  CXC_TOKEN,
  CXC_EMPRESA,
  CXC_SOAP_NS,
  CXC_VENTAS_SOAP_NS,
  CXC_VENTAS_SOAP_ACTION,
  CXC_TIMEOUT_MS,
} = process.env;

const CXC_REQUEST_TIMEOUT_MS = Number(CXC_TIMEOUT_MS) || 120000; // 2 min por defecto (proveedor puede tardar >60s)

const SOAP_NS = CXC_SOAP_NS || 'http://tempuri.org/';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
});

const ensureConfig = () => {
  if (!CXC_API_URL) {
    throw new Error('CXC_API_URL es requerido');
  }
  if (!CXC_TOKEN) {
    throw new Error('CXC_TOKEN es requerido');
  }
  if (!CXC_EMPRESA) {
    throw new Error('CXC_EMPRESA es requerido');
  }
};

const ensureVentasConfig = () => {
  const baseUrl = CXC_VENTAS_URL || CXC_API_URL;
  if (!baseUrl) {
    throw new Error('CXC_VENTAS_URL o CXC_API_URL es requerido');
  }
  if (!CXC_TOKEN) {
    throw new Error('CXC_TOKEN es requerido');
  }
  if (!CXC_EMPRESA) {
    throw new Error('CXC_EMPRESA es requerido');
  }
};

const escapeXml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const parseJsonish = (value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    return value;
  }
};

const getSoapAction = (method, soapNs = SOAP_NS, override = '') => {
  if (override) return override;
  if (!soapNs) return method;
  const base = soapNs.endsWith('/') ? soapNs : `${soapNs}/`;
  return `${base}${method}`;
};

const buildEnvelope = (method, params, soapNs = SOAP_NS) => {
  const entries = Object.entries(params || {});
  const bodyParams = entries
    .map(([key, value]) => `<${key}>${escapeXml(value)}</${key}>`)
    .join('');

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ',
    'xmlns:xsd="http://www.w3.org/2001/XMLSchema" ',
    'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
    '<soap:Body>',
    `<${method} xmlns="${soapNs}">`,
    bodyParams,
    `</${method}>`,
    '</soap:Body>',
    '</soap:Envelope>',
  ].join('');
};

const extractResult = (xml) => {
  const parsed = parser.parse(xml);
  const envelope =
    parsed['soap:Envelope'] || parsed['Envelope'] || parsed['SOAP-ENV:Envelope'];
  const body =
    envelope?.['soap:Body'] || envelope?.['Body'] || envelope?.['SOAP-ENV:Body'];

  if (!body || typeof body !== 'object') {
    return { parsed, response: null, result: null };
  }

  const responseKey =
    Object.keys(body).find((key) => key.toLowerCase().endsWith('response')) ||
    Object.keys(body)[0];
  const response = body[responseKey];
  if (!response || typeof response !== 'object') {
    return { parsed, response, result: response };
  }

  const resultKey = Object.keys(response).find((key) =>
    key.toLowerCase().endsWith('result')
  );
  const result = resultKey ? response[resultKey] : response;
  return { parsed, response, result };
};

const resolveServiceUrl = (method, baseUrl = CXC_API_URL) => {
  if (!baseUrl) return baseUrl;
  if (baseUrl.includes('{{method}}')) {
    return baseUrl.replace('{{method}}', method);
  }
  if (baseUrl.includes('{method}')) {
    return baseUrl.replace('{method}', method);
  }
  if (baseUrl.includes(':method')) {
    return baseUrl.replace(':method', method);
  }
  return baseUrl;
};

const resolveGetUrl = (method, baseUrl = CXC_API_URL) => {
  if (!baseUrl) return baseUrl;
  if (baseUrl.includes('{{method}}')) {
    return baseUrl.replace('{{method}}', method);
  }
  if (baseUrl.includes('{method}')) {
    return baseUrl.replace('{method}', method);
  }
  if (baseUrl.includes(':method')) {
    return baseUrl.replace(':method', method);
  }
  return `${baseUrl.replace(/\/$/, '')}/${method}`;
};

const baseParams = (params = {}) => {
  const database =
    params.strPar_Basedatos ?? params.strPar_BaseDatos ?? CXC_EMPRESA;
  const token = params.strPar_Token ?? CXC_TOKEN;
  const cleaned = { ...params };
  delete cleaned.strPar_Basedatos;
  delete cleaned.strPar_BaseDatos;
  delete cleaned.strPar_Token;

  return {
    strPar_Basedatos: database,
    strPar_Token: token,
    ...cleaned,
  };
};

const baseVentasParams = (params = {}) => {
  const empresa = params.strPar_Empresa ?? CXC_EMPRESA;
  const cleaned = { ...params };
  delete cleaned.strPar_Empresa;
  delete cleaned.strPar_Basedatos;
  delete cleaned.strPar_BaseDatos;
  delete cleaned.strPar_Token;

  return {
    strPar_Empresa: empresa,
    ...cleaned,
  };
};

export const cxc = {
  async call(method, params = {}, options = {}) {
    ensureConfig();
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : CXC_REQUEST_TIMEOUT_MS;
    const payload = buildEnvelope(method, baseParams(params), SOAP_NS);
    const response = await axios.post(resolveServiceUrl(method), payload, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: getSoapAction(method, SOAP_NS),
      },
      timeout: timeoutMs,
    });

    const xml = response.data;
    const { parsed, response: soapResponse, result } = extractResult(xml);
    return { xml, parsed, response: soapResponse, result };
  },

  async callWithUrl(method, params = {}, baseUrl = '') {
    ensureVentasConfig();
    const targetUrl = baseUrl || CXC_VENTAS_URL || CXC_API_URL;
    const ventasNs = CXC_VENTAS_SOAP_NS || SOAP_NS;
    const payload = buildEnvelope(method, baseVentasParams(params), ventasNs);
    const response = await axios.post(resolveServiceUrl(method, targetUrl), payload, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: getSoapAction(method, ventasNs, CXC_VENTAS_SOAP_ACTION),
      },
      timeout: CXC_REQUEST_TIMEOUT_MS,
    });

    const xml = response.data;
    const { parsed, response: soapResponse, result } = extractResult(xml);
    return { xml, parsed, response: soapResponse, result };
  },

  async callGet(method, params = {}, options = {}) {
    ensureConfig();
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : CXC_REQUEST_TIMEOUT_MS;
    const response = await axios.get(resolveGetUrl(method), {
      params: baseParams(params),
      timeout: timeoutMs,
    });
    const raw = response.data;
    const result = parseJsonish(raw);
    return { xml: raw, parsed: null, response: null, result };
  },

  async callGetWithUrl(method, params = {}, baseUrl = '') {
    ensureVentasConfig();
    const targetUrl = baseUrl || CXC_VENTAS_URL || CXC_API_URL;
    const response = await axios.get(resolveGetUrl(method, targetUrl), {
      params,
      timeout: CXC_REQUEST_TIMEOUT_MS,
    });
    const raw = response.data;
    const result = parseJsonish(raw);
    return { xml: raw, parsed: null, response: null, result };
  },

  estadoCartera({ fecha, cedula, vendedor, timeoutMs, usePost } = {}) {
    const params = {
      datPar_Fecha: fecha,
      strPar_Cedula: cedula,
      strPar_Vended: vendedor,
    };
    if (usePost) {
      const postTimeout = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : 30000;
      return this.call('EstadoDeCuentaCartera', params, { timeoutMs: postTimeout });
    }
    const opts = typeof timeoutMs === 'number' && timeoutMs > 0 ? { timeoutMs } : {};
    return this.callGet('EstadoDeCuentaCartera', params, opts).catch(() =>
      this.call('EstadoDeCuentaCartera', params)
    );
  },

  listadoClientes({ vendedor, cedula, filas = 50, pagina = 1 } = {}) {
    const params = {
      strPar_Vended: vendedor ?? '',
      intPar_Filas: filas,
      intPar_Pagina: pagina,
    };
    if (cedula != null && String(cedula).trim() !== '') {
      params.strPar_Cedula = String(cedula).trim();
    }
    return this.callGet('ListadoClientes', params).catch(() =>
      this.call('ListadoClientes', params)
    );
  },

  detalleFacturasPedido(params = {}) {
    return this.call('DetalleFacturasPorPedido', params);
  },

  generarInfoVentas(params = {}) {
    return this.callGetWithUrl('GenerarInfoVentas', params, CXC_VENTAS_URL);
  },

  trazabilidadPedidos(params = {}) {
    return this.call('TrazabilidadPedidos', params);
  },
};
