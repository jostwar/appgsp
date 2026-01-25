import axios from 'axios';

const { WOO_URL, WOO_KEY, WOO_SECRET, WOO_POINTS_META_KEYS } = process.env;

const normalizeCedula = (value) =>
  String(value || '')
    .replace(/\s+/g, '')
    .replace(/[^\d]/g, '');

const getPointsMetaKeys = () => {
  if (!WOO_POINTS_META_KEYS) {
    return [
      'wc_points_balance',
      'points_balance',
      'woorewards_points',
      'wlr_points',
      'yith_wcw_points',
      'gsp_points',
    ];
  }
  return WOO_POINTS_META_KEYS.split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const ensureWooConfig = () => {
  if (!WOO_URL) {
    throw new Error('WOO_URL es requerido');
  }
  if (!WOO_KEY || !WOO_SECRET) {
    throw new Error('WOO_KEY y WOO_SECRET son requeridos');
  }
};

const client = axios.create({
  baseURL: WOO_URL,
  timeout: 15000,
});

const fetchCustomersPage = async ({ page, perPage }) => {
  const response = await client.get('/wp-json/wc/v3/customers', {
    params: {
      consumer_key: WOO_KEY,
      consumer_secret: WOO_SECRET,
      per_page: perPage,
      page,
    },
  });
  return response.data;
};

const extractCedulaFromCustomer = (customer) => {
  const meta = Array.isArray(customer?.meta_data) ? customer.meta_data : [];
  const metaCandidates = [
    'billing_cedula',
    'billing_nit',
    'cedula',
    'nit',
    'identificacion',
    'documento',
  ];

  for (const key of metaCandidates) {
    const entry = meta.find((item) => item?.key === key);
    if (entry?.value) {
      return normalizeCedula(entry.value);
    }
  }

  const billingCedula =
    customer?.billing?.cedula ||
    customer?.billing?.nit ||
    customer?.billing?.document;
  if (billingCedula) {
    return normalizeCedula(billingCedula);
  }

  return '';
};

const extractPointsFromCustomer = (customer) => {
  const meta = Array.isArray(customer?.meta_data) ? customer.meta_data : [];
  const keys = getPointsMetaKeys();
  for (const key of keys) {
    const entry = meta.find((item) => item?.key === key);
    if (entry?.value !== undefined && entry?.value !== null && entry?.value !== '') {
      return Number(entry.value) || 0;
    }
  }
  return null;
};

export const woo = {
  async findCustomerByCedula(cedula, { perPage = 100, maxPages = 10 } = {}) {
    ensureWooConfig();
    const target = normalizeCedula(cedula);
    if (!target) {
      throw new Error('cedula es requerida');
    }

    for (let page = 1; page <= maxPages; page += 1) {
      const customers = await fetchCustomersPage({ page, perPage });
      if (!Array.isArray(customers) || customers.length === 0) {
        break;
      }

      const match = customers.find((customer) => {
        const value = extractCedulaFromCustomer(customer);
        return value && value === target;
      });

      if (match) {
        return match;
      }

      if (customers.length < perPage) {
        break;
      }
    }

    return null;
  },

  getCustomerPoints(customer) {
    return extractPointsFromCustomer(customer);
  },
};
