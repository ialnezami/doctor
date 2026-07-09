import AsyncStorage from '@react-native-async-storage/async-storage';

// --- Products ---

const productsKey = (id) => `@medi_products_${id}`;

export async function cacheProducts(pharmacyId, products) {
  try { await AsyncStorage.setItem(productsKey(pharmacyId), JSON.stringify(products)); } catch {}
}

export async function getCachedProducts(pharmacyId) {
  try {
    const raw = await AsyncStorage.getItem(productsKey(pharmacyId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function upsertCachedProduct(pharmacyId, product) {
  const list = await getCachedProducts(pharmacyId);
  const idx = list.findIndex(p => p._id === product._id);
  if (idx >= 0) list[idx] = product;
  else list.unshift(product);
  await cacheProducts(pharmacyId, list);
}

export async function removeCachedProduct(pharmacyId, productId) {
  const list = await getCachedProducts(pharmacyId);
  await cacheProducts(pharmacyId, list.filter(p => p._id !== productId));
}

export async function adjustCachedStock(pharmacyId, productId, delta) {
  const list = await getCachedProducts(pharmacyId);
  const updated = list.map(p => {
    if (p._id !== productId) return p;
    return { ...p, stockQty: Math.max(0, (p.stockQty || 0) + delta) };
  });
  await cacheProducts(pharmacyId, updated);
  return updated.find(p => p._id === productId);
}

// --- Sales ---

const salesKey = (id) => `@medi_sales_${id}`;

export async function cacheSales(pharmacyId, sales) {
  try { await AsyncStorage.setItem(salesKey(pharmacyId), JSON.stringify(sales)); } catch {}
}

export async function getCachedSales(pharmacyId) {
  try {
    const raw = await AsyncStorage.getItem(salesKey(pharmacyId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function addCachedSale(pharmacyId, sale) {
  const list = await getCachedSales(pharmacyId);
  await cacheSales(pharmacyId, [sale, ...list]);
}

// --- Profile ---

const profileKey = (id) => `@medi_profile_${id}`;

export async function cacheProfile(pharmacyId, profile) {
  try { await AsyncStorage.setItem(profileKey(pharmacyId), JSON.stringify(profile)); } catch {}
}

export async function getCachedProfile(pharmacyId) {
  try {
    const raw = await AsyncStorage.getItem(profileKey(pharmacyId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
