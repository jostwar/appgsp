const baseUrl = process.env.EXPO_PUBLIC_WC_URL || 'https://gsp.com.co';
const key = process.env.EXPO_PUBLIC_WC_KEY;
const secret = process.env.EXPO_PUBLIC_WC_SECRET;

const WC_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutos
const productsCache = new Map();
const categoriesCache = { data: null, expiresAt: 0 };

const normalize = (value) => String(value || '').toLowerCase().trim();

const buildUrl = (path, { auth = true, params = {} } = {}) => {
  const url = new URL(path, baseUrl);
  if (auth) {
    url.searchParams.set('consumer_key', key);
    url.searchParams.set('consumer_secret', secret);
  }
  Object.entries(params).forEach(([param, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(param, String(value));
    }
  });
  return url;
};

const extractNames = (items) =>
  Array.isArray(items) ? items.map((term) => term?.name).filter(Boolean) : [];

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

const findBrandAttr = (attributes = []) =>
  attributes.find((attr) => {
    const name = normalize(attr?.name);
    const slug = normalize(attr?.slug);
    return (
      slug === 'pa_brand' ||
      slug === 'pa_marca' ||
      slug === 'pa_marcas' ||
      slug === 'product_brand' ||
      slug === 'brand' ||
      slug.includes('marca') ||
      slug.includes('brand') ||
      name === 'marca' ||
      name === 'marcas' ||
      name === 'brand' ||
      name === 'brands'
    );
  });

const matchTermByName = (terms, brandName) => {
  const target = normalize(brandName);
  return terms.find((term) => {
    const name = normalize(term?.name);
    const slug = normalize(term?.slug);
    return name === target || slug === target;
  });
};

const matchesBrandName = (value, brandName) => {
  if (!value || !brandName) return false;
  return normalize(value) === normalize(brandName);
};

const filterProductsByBrand = (products, brandName) => {
  if (!brandName) return products;
  const targetBrand = normalize(brandName);
  return products.filter((product) => {
    const name = normalize(product?.name || '');
    if (name && targetBrand && name.includes(targetBrand)) return true;

    const brands = Array.isArray(product?.brands) ? product.brands : [];
    const tags = Array.isArray(product?.tags) ? product.tags : [];
    const attributes = Array.isArray(product?.attributes) ? product.attributes : [];

    if (
      brands.some(
        (brand) =>
          matchesBrandName(brand?.name, brandName) ||
          matchesBrandName(brand?.slug, brandName)
      )
    ) {
      return true;
    }

    if (
      tags.some(
        (tag) =>
          matchesBrandName(tag?.name, brandName) ||
          matchesBrandName(tag?.slug, brandName)
      )
    ) {
      return true;
    }

    if (
      attributes.some((attr) => {
        if (!attr) return false;
        const attrName = normalize(attr?.name);
        const attrSlug = normalize(attr?.slug);
        if (!attrName.includes('marca') && !attrName.includes('brand')) {
          if (!attrSlug.includes('marca') && !attrSlug.includes('brand')) {
            return false;
          }
        }
        const options = Array.isArray(attr?.options) ? attr.options : [];
        return options.some((option) => matchesBrandName(option, brandName));
      })
    ) {
      return true;
    }

    return false;
  });
};

const BRAND_TERM_TTL_MS = 5 * 60 * 1000;
const brandTermCache = new Map();

const resolveBrandTerm = async (brandName) => {
  if (!brandName) return null;
  const key = normalize(brandName);
  const cached = brandTermCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < BRAND_TERM_TTL_MS) {
    return cached.value;
  }

  const taxonomyEndpoints = [
    buildUrl('/wp-json/wp/v2/product_brand', {
      auth: false,
      params: { per_page: '100', search: brandName },
    }),
    buildUrl('/wp-json/wc/v3/products/brands', {
      params: { per_page: '100', search: brandName },
    }),
  ];

  for (const url of taxonomyEndpoints) {
    const response = await fetch(url.toString());
    if (!response.ok) continue;
    const terms = await response.json();
    const match = matchTermByName(terms, brandName);
    if (match?.id || match?.slug) {
      const value = { id: match?.id, slug: match?.slug };
      brandTermCache.set(key, { value, fetchedAt: Date.now() });
      return value;
    }
  }

  brandTermCache.set(key, { value: null, fetchedAt: Date.now() });
  return null;
};

export async function fetchProducts({
  page = 1,
  perPage = 50,
  categoryId,
  brandName,
} = {}) {
  if (!hasWooCredentials()) {
    return [];
  }

  const cacheKey = `p:${page}:${perPage}:${categoryId || ''}:${(brandName || '').trim()}`;
  const cached = productsCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
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

  const runRequest = async (extraParams) => {
    const products = await request(extraParams);
    const unique = new Map();
    products.forEach((product) => {
      if (product?.id) {
        unique.set(product.id, product);
      }
    });
    return Array.from(unique.values());
  };

  if (brandName) {
    const brandTerm = await resolveBrandTerm(brandName);
    const params = { search: brandName };
    if (brandTerm?.id) {
      params.brand = brandTerm.id;
      params.product_brand = brandTerm.id;
    }
    if (brandTerm?.slug) {
      params.brand = params.brand ?? brandTerm.slug;
      params.product_brand = params.product_brand ?? brandTerm.slug;
    }
    const data = await runRequest(params);
    const filtered = filterProductsByBrand(data, brandName);
    if (filtered.length > 0) {
      productsCache.set(cacheKey, {
        data: filtered,
        expiresAt: Date.now() + WC_CACHE_TTL_MS,
      });
      return filtered;
    }
  }

  const fallbackData = await runRequest();
  const result = filterProductsByBrand(fallbackData, brandName);
  productsCache.set(cacheKey, {
    data: result,
    expiresAt: Date.now() + WC_CACHE_TTL_MS,
  });
  if (productsCache.size > 80) {
    const now = Date.now();
    for (const [k, v] of productsCache.entries()) {
      if (v.expiresAt < now) productsCache.delete(k);
    }
  }
  return result;
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
  const now = Date.now();
  if (categoriesCache.data && categoriesCache.expiresAt > now) {
    return categoriesCache.data;
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
  const data = await response.json();
  categoriesCache.data = data;
  categoriesCache.expiresAt = now + WC_CACHE_TTL_MS;
  return data;
}

export async function fetchBrandOptions() {
  if (!hasWooCredentials()) {
    return [];
  }

  const attrsUrl = buildUrl('/wp-json/wc/v3/products/attributes', {
    params: { per_page: '100' },
  });
  const attrsResponse = await fetch(attrsUrl.toString());
  if (attrsResponse.ok) {
    const attributes = await attrsResponse.json();
    const brandAttr = findBrandAttr(attributes);
    if (brandAttr?.id) {
      const termsUrl = buildUrl(
        `/wp-json/wc/v3/products/attributes/${brandAttr.id}/terms`,
        { params: { per_page: '100' } }
      );
      const termsResponse = await fetch(termsUrl.toString());
      if (termsResponse.ok) {
        const terms = await termsResponse.json();
        const names = extractNames(terms);
        if (names.length > 0) {
          return names;
        }
      }
    }
  }

  const fallbackEndpoints = [
    buildUrl('/wp-json/wp/v2/product_brand', {
      auth: false,
      params: { per_page: '100', hide_empty: 'true' },
    }),
    buildUrl('/wp-json/wc/v3/products/brands', {
      params: { per_page: '100', hide_empty: 'true' },
    }),
  ];

  for (const url of fallbackEndpoints) {
    const response = await fetch(url.toString());
    if (!response.ok) continue;
    const data = await response.json();
    const names = extractNames(data);
    if (names.length > 0) {
      return names;
    }
  }

  return [];
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
