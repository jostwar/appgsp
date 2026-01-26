import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';

const { CXC_API_URL, CXC_TOKEN, CXC_EMPRESA, CXC_SOAP_NS } = process.env;

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

const escapeXml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const getSoapAction = (method) => {
  const base = SOAP_NS.endsWith('/') ? SOAP_NS : `${SOAP_NS}/`;
  return `${base}${method}`;
};

const buildEnvelope = (method, params) => {
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
    `<${method} xmlns="${SOAP_NS}">`,
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

const baseParams = (params = {}) => ({
  strPar_BaseDatos: CXC_EMPRESA,
  strPar_Token: CXC_TOKEN,
  ...params,
});

export const cxc = {
  async call(method, params = {}) {
    ensureConfig();
    const payload = buildEnvelope(method, baseParams(params));
    const response = await axios.post(CXC_API_URL, payload, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: getSoapAction(method),
      },
      timeout: 20000,
    });

    const xml = response.data;
    const { parsed, response: soapResponse, result } = extractResult(xml);
    return { xml, parsed, response: soapResponse, result };
  },

  estadoCartera({ fecha, cedula, vendedor } = {}) {
    return this.call('EstadoCuentasCartera', {
      datPar_Fecha: fecha,
      strPar_Cedula: cedula,
      strPar_Vended: vendedor,
    });
  },

  listadoClientes({ vendedor, filas = 50, pagina = 1 } = {}) {
    return this.call('ListadoClientes', {
      strPar_Vended: vendedor,
      intPar_Filas: filas,
      intPar_Pagina: pagina,
    });
  },

  async detalleFacturasPedido(params = {}) {
    try {
      const primary = await this.call('DetalleFacturasPedido', params);
      const xmlText = String(primary?.xml || '').toLowerCase();
      if (
        xmlText.includes('funcion no activa') ||
        xmlText.includes('función no activa')
      ) {
        return this.call('DetalleFacturasPorPedido', params);
      }
      return primary;
    } catch (error) {
      const message = String(error?.response?.data || error?.message || '');
      if (message.toLowerCase().includes('soapaction')) {
        return this.call('DetalleFacturasPorPedido', params);
      }
      throw error;
    }
  },

  trazabilidadPedidos(params = {}) {
    return this.call('TrazabilidadPedidos', params);
  },
};
