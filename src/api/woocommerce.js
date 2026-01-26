const baseUrl = process.env.EXPO_PUBLIC_WC_URL || 'https://gsp.com.co';
const key = process.env.EXPO_PUBLIC_WC_KEY;
const secret = process.env.EXPO_PUBLIC_WC_SECRET;

export function hasWooCredentials() {
  return Boolean(key && secret);
}

export function getBaseUrl() {
  return baseUrl;
}

export function getCheckoutUrl() {
  return `${baseUrl.replace(/\/$/, '')}/checkout/`;
}

export function getOrderPayUrl(orderId, orderKey) {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/checkout/order-pay/${orderId}/?pay_for_order=true&key=${orderKey}`;
}

export async function fetchProducts({ page = 1, perPage = 50, categoryId } = {}) {
  if (!hasWooCredentials()) {
    return [];
  }

  const request = async (extraParams = {}) => {
    const url = new URL('/wp-json/wc/v3/products', baseUrl);
    url.searchParams.set('consumer_key', key);
    url.searchParams.set('consumer_secret', secret);
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('page', String(page));
    url.searchParams.set('status', 'publish');
    url.searchParams.set('stock_status', 'instock');
    if (categoryId) {
      url.searchParams.set('category', String(categoryId));
    }
    Object.entries(extraParams).forEach(([param, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(param, String(value));
      }
    });
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error('No se pudieron cargar productos.');
    }
    return response.json();
  };

  const [baseProducts, variableProducts] = await Promise.all([
    request(),
    request({ type: 'variable' }),
  ]);

  const merged = [...baseProducts, ...variableProducts];
  const unique = new Map();
  merged.forEach((product) => {
    if (product?.id) {
      unique.set(product.id, product);
    }
  });
  return Array.from(unique.values());
}

export async function fetchAllProducts({ perPage = 50, maxPages = 10 } = {}) {
  const all = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await fetchProducts({ page, perPage });
    all.push(...batch);
    if (batch.length < perPage) {
      break;
    }
  }
  return all;
}

export async function fetchCategories() {
  if (!hasWooCredentials()) {
    return [];
  }

  const url = new URL('/wp-json/wc/v3/products/categories', baseUrl);
  url.searchParams.set('consumer_key', key);
  url.searchParams.set('consumer_secret', secret);
  url.searchParams.set('per_page', '100');
  url.searchParams.set('hide_empty', 'false');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error('No se pudieron cargar categorías.');
  }
  return response.json();
}

export async function searchProducts(query, { perPage = 12 } = {}) {
  if (!hasWooCredentials()) {
    return [];
  }
  const trimmed = String(query || '').trim();
  if (!trimmed) {
    return [];
  }
  const request = async (extraParams = {}) => {
    const url = new URL('/wp-json/wc/v3/products', baseUrl);
    url.searchParams.set('consumer_key', key);
    url.searchParams.set('consumer_secret', secret);
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('page', '1');
    url.searchParams.set('status', 'publish');
    url.searchParams.set('stock_status', 'instock');
    Object.entries(extraParams).forEach(([param, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(param, String(value));
      }
    });
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error('No se pudieron cargar productos.');
    }
    return response.json();
  };

  const [bySearch, bySku] = await Promise.all([
    request({ search: trimmed }),
    request({ sku: trimmed }),
  ]);
  const merged = [...bySearch, ...bySku];
  const unique = new Map();
  merged.forEach((product) => {
    if (product?.id) {
      unique.set(product.id, product);
    }
  });
  return Array.from(unique.values());
}

export async function createOrder(lineItems) {
  if (!hasWooCredentials()) {
    throw new Error('Faltan credenciales de WooCommerce.');
  }

  const url = new URL('/wp-json/wc/v3/orders', baseUrl);
  url.searchParams.set('consumer_key', key);
  url.searchParams.set('consumer_secret', secret);

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'pending',
      line_items: lineItems,
    }),
  });

  if (!response.ok) {
    throw new Error('No se pudo crear la orden.');
  }

  return response.json();
}
