const BASE_URL_FALLBACK = 'https://app.gsp.com.co';
const baseUrl = process.env.EXPO_PUBLIC_BACKEND_URL || BASE_URL_FALLBACK;

export function getBackendUrl() {
  const url = (baseUrl || BASE_URL_FALLBACK).replace(/\/$/, '');
  return url || BASE_URL_FALLBACK;
}

const REQUEST_TIMEOUT_MS = 20000; // 20 segundos

async function request(path, { method = 'GET', body, params, timeoutMs } = {}) {
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

  const timeout = timeoutMs ?? REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url.toString(), {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const message = data?.error || 'Error en el backend';
      throw new Error(message);
    }
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function loginWoo({ email, password }) {
  return request('/api/woo/login', {
    method: 'POST',
    body: { email, password },
  });
}

export function refreshWooSession({ token }) {
  return request('/api/woo/session', {
    method: 'POST',
    body: { token },
  });
}

export function registerPushToken({ token, cedula, email, platform } = {}) {
  return request('/api/push/register', {
    method: 'POST',
    body: { token, cedula, email, platform },
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

export function getHomeBanners() {
  return request('/api/home/banners');
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
    timeoutMs: 28000,
  });
}

export function getCommercialContact({ cedula, vendedor } = {}) {
  return request('/api/cxc/comercial', {
    params: { cedula, vendedor },
  });
}

export function getGspCareCatalog() {
  return request('/api/gspcare/catalog');
}

export function getGspCareStatus({ cedula }) {
  return request('/api/gspcare/status', {
    params: { cedula },
  });
}

export function getGspCareRequests({ cedula }) {
  return request('/api/gspcare/requests', {
    params: { cedula },
  });
}

export function createGspCareRequest({ cedula, serviceId, clientOrEquipment }) {
  return request('/api/gspcare/request', {
    method: 'POST',
    body: { cedula, serviceId, clientOrEquipment: clientOrEquipment || undefined },
  });
}

export function requestCashback({ cedula, amount }) {
  return request('/api/cashback/request', {
    method: 'POST',
    body: { cedula, amount },
  });
}
