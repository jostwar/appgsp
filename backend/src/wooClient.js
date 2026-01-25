import axios from 'axios';

const {
  WOO_URL,
  WOO_KEY,
  WOO_SECRET,
  WOO_POINTS_META_KEYS,
  WOO_CEDULA_META_KEYS,
} = process.env;

const normalizeCedula = (value) =>
  String(value || '')
    .replace(/\s+/g, '')
    .replace(/[^\d]/g, '');

const normalizeKey = (value) => String(value || '').toLowerCase();

const matchesCedula = (candidate, target) => {
  if (!candidate || !target) return false;
  if (candidate === target) return true;
  return candidate.startsWith(target) || target.startsWith(candidate);
};

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

const getCedulaMetaKeys = () => {
  if (!WOO_CEDULA_META_KEYS) {
    return [
      'billing_cedula',
      'billing_nit',
      'cedula',
      'nit',
      'gsp_nit',
      'identificacion',
      'documento',
    ].map(normalizeKey);
  }
  return WOO_CEDULA_META_KEYS.split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map(normalizeKey);
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

const fetchCustomersPage = async ({ page, perPage, orderBy, order }) => {
  const response = await client.get('/wp-json/wc/v3/customers', {
    params: {
      consumer_key: WOO_KEY,
      consumer_secret: WOO_SECRET,
      per_page: perPage,
      page,
      orderby: orderBy,
      order,
    },
  });
  return response.data;
};

const extractCedulaFromCustomer = (customer) => {
  const directCandidates = [
    customer?.gsp_nit,
    customer?.billing_nit,
    customer?.nit,
    customer?.cedula,
    customer?.identificacion,
  ];

  for (const value of directCandidates) {
    if (value) {
      return normalizeCedula(value);
    }
  }

  const meta = Array.isArray(customer?.meta_data) ? customer.meta_data : [];
  const metaCandidates = getCedulaMetaKeys();

  for (const key of metaCandidates) {
    const entry = meta.find((item) => normalizeKey(item?.key) === key);
    if (entry?.value) {
      return normalizeCedula(entry.value);
    }
  }

  for (const key of metaCandidates) {
    const entry = meta.find((item) => normalizeKey(item?.key).includes(key));
    if (entry?.value) {
      return normalizeCedula(entry.value);
    }
  }

  const billingCedula =
    customer?.billing?.cedula ||
    customer?.billing?.billing_nit ||
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
  async findCustomerByCedula(
    cedula,
    { perPage = 100, maxPages = 50, orderBy = 'id', order = 'asc' } = {}
  ) {
    ensureWooConfig();
    const target = normalizeCedula(cedula);
    if (!target) {
      throw new Error('cedula es requerida');
    }

    for (let page = 1; page <= maxPages; page += 1) {
      const customers = await fetchCustomersPage({
        page,
        perPage,
        orderBy,
        order,
      });
      if (!Array.isArray(customers) || customers.length === 0) {
        break;
      }

      const match = customers.find((customer) => {
        const value = extractCedulaFromCustomer(customer);
        return matchesCedula(value, target);
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

  async listCedulas({
    perPage = 100,
    pages = 2,
    limit = 50,
    orderBy = 'id',
    order = 'asc',
  } = {}) {
    ensureWooConfig();
    const results = [];

    for (let page = 1; page <= pages; page += 1) {
      const customers = await fetchCustomersPage({
        page,
        perPage,
        orderBy,
        order,
      });
      if (!Array.isArray(customers) || customers.length === 0) {
        break;
      }

      customers.forEach((customer) => {
        const cedula = extractCedulaFromCustomer(customer);
        if (cedula) {
          results.push({
            id: customer?.id,
            cedula,
            gsp_nit: customer?.gsp_nit || null,
            billing_nit: customer?.billing_nit || null,
          });
        }
      });

      if (results.length >= limit) {
        break;
      }

      if (customers.length < perPage) {
        break;
      }
    }

    return results.slice(0, limit);
  },

  async listMetaKeys({ perPage = 100, pages = 2 } = {}) {
    ensureWooConfig();
    const keys = new Set();

    for (let page = 1; page <= pages; page += 1) {
      const customers = await fetchCustomersPage({ page, perPage });
      if (!Array.isArray(customers) || customers.length === 0) {
        break;
      }

      customers.forEach((customer) => {
        Object.keys(customer || {}).forEach((key) => {
          if (key) {
            keys.add(String(key));
          }
        });
        const meta = Array.isArray(customer?.meta_data) ? customer.meta_data : [];
        meta.forEach((item) => {
          if (item?.key) {
            keys.add(String(item.key));
          }
        });
      });

      if (customers.length < perPage) {
        break;
      }
    }

    return Array.from(keys).sort();
  },
};
