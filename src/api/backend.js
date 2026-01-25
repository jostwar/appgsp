const baseUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export function getBackendUrl() {
  return baseUrl.replace(/\/$/, '');
}

async function request(path, { method = 'GET', body, params } = {}) {
  const urlBase = getBackendUrl();
  if (!urlBase) {
    throw new Error('EXPO_PUBLIC_BACKEND_URL no está configurada');
  }

  const url = new URL(path, urlBase);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const response = await fetch(url.toString(), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error || 'Error en el backend';
    throw new Error(message);
  }
  return data;
}

export async function backendHealth() {
  try {
    const data = await request('/health');
    return { ok: data?.ok === true, data };
  } catch (error) {
    return { ok: false, error: error?.message || 'Sin conexión' };
  }
}

export function login({ identificacion, tipo }) {
  return request('/api/login', {
    method: 'POST',
    body: { identificacion, tipo },
  });
}

export function getCustomer({ identificacion, tipo }) {
  return request(`/api/customers/${encodeURIComponent(identificacion)}`, {
    params: { tipo },
  });
}

export function getOrders({ identificacion, tipo, page, perPage }) {
  return request('/api/orders', {
    params: { identificacion, tipo, page, perPage },
  });
}

export function getPoints({ identificacion, tipo }) {
  return request('/api/points', {
    params: { identificacion, tipo },
  });
}

export function getPointsHistory({ identificacion, tipo, page, perPage }) {
  return request('/api/points/history', {
    params: { identificacion, tipo, page, perPage },
  });
}
