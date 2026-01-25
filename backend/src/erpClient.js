import axios from 'axios';

const {
  ERP_API_URL,
  ERP_API_TOKEN,
  ERP_EMPRESA,
  ERP_AUTH_ENDPOINT,
  ERP_CUSTOMER_ENDPOINT,
  ERP_ORDERS_ENDPOINT,
  ERP_POINTS_ENDPOINT,
  ERP_POINTS_HISTORY_ENDPOINT,
} = process.env;

if (!ERP_API_URL) {
  throw new Error('ERP_API_URL es requerido');
}

const client = axios.create({
  baseURL: ERP_API_URL,
  headers: {
    Authorization: `Bearer ${ERP_API_TOKEN || ''}`,
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

const withEmpresa = (params = {}) => ({
  ...params,
  empresa: ERP_EMPRESA,
});

export const erp = {
  async login({ identificacion, tipo }) {
    const path = ERP_AUTH_ENDPOINT || '/auth/login';
    const response = await client.post(path, {
      identificacion,
      tipo,
      empresa: ERP_EMPRESA,
    });
    return response.data;
  },

  async getCustomer({ identificacion, tipo }) {
    const path = ERP_CUSTOMER_ENDPOINT || '/clientes';
    const response = await client.get(path, {
      params: withEmpresa({ identificacion, tipo }),
    });
    return response.data;
  },

  async getOrders({ identificacion, tipo, page = 1, perPage = 20 }) {
    const path = ERP_ORDERS_ENDPOINT || '/compras';
    const response = await client.get(path, {
      params: withEmpresa({ identificacion, tipo, page, perPage }),
    });
    return response.data;
  },

  async getPoints({ identificacion, tipo }) {
    const path = ERP_POINTS_ENDPOINT || '/puntos';
    const response = await client.get(path, {
      params: withEmpresa({ identificacion, tipo }),
    });
    return response.data;
  },

  async getPointsHistory({ identificacion, tipo, page = 1, perPage = 20 }) {
    const path = ERP_POINTS_HISTORY_ENDPOINT || '/puntos/historial';
    const response = await client.get(path, {
      params: withEmpresa({ identificacion, tipo, page, perPage }),
    });
    return response.data;
  },
};

export function isB2BApproved(customer) {
  if (!customer) return false;
  const candidates = [
    customer.b2bApproved,
    customer.b2b_approved,
    customer.b2bStatus,
    customer.estado_b2b,
    customer.aprobado_b2b,
    customer.approved,
    customer.status,
  ];
  return candidates.some((value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      return ['approved', 'aprobado', 'true', '1', 'activo'].includes(
        value.toLowerCase()
      );
    }
    if (typeof value === 'number') return value === 1;
    return false;
  });
}
