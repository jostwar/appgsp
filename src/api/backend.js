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

export function loginWoo({ email, password }) {
  return request('/api/woo/login', {
    method: 'POST',
    body: { email, password },
  });
}

export function getRewardsPoints({ cedula }) {
  return request('/api/cxc/points', {
    method: 'POST',
    body: { cedula },
  });
}

export function getRewardsCatalog() {
  return request('/api/rewards');
}

export function getHomeOffers() {
  return request('/api/home/offers');
}

export function getWeeklyProduct() {
  return request('/api/home/weekly');
}

export function getWooOrders({ cedula, customerId, email, page, perPage } = {}) {
  return request('/api/woo/orders', {
    params: { cedula, customerId, email, page, perPage },
  });
}

export function getCarteraSummary({ cedula, vendedor } = {}) {
  return request('/api/cxc/estado-cartera/summary', {
    params: { cedula, vendedor },
  });
}

export function getCedulaByEmail({ email } = {}) {
  return request('/api/woo/cedula-by-email', {
    params: { email },
  });
}
