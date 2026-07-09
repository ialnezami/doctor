import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getPharmacyProfile, getProducts, createProduct, adjustStock } from '../../api/pharmacies';
import {
  cacheProducts, getCachedProducts,
  upsertCachedProduct, removeCachedProduct, adjustCachedStock,
} from '../../utils/localStore';
import { enqueue } from '../../utils/offlineQueue';
import useNetworkStatus from '../../hooks/useNetworkStatus';
import OfflineBanner from '../../components/OfflineBanner';
import C from '../../constants/colors';

const isNetworkError = (e) =>
  !e?.response || e?.message?.includes('Network Error') || e?.code === 'ERR_NETWORK';

export default function PharmacyInventoryScreen() {
  const [approved,   setApproved]   = useState(null);
  const [pharmacyId, setPharmacyId] = useState(null);
  const [products,   setProducts]   = useState([]);
  const [form,       setForm]       = useState({ name: '', barcode: '', price: '', stockQty: '0', unit: 'tablet' });
  const [adding,     setAdding]     = useState(false);
  const [error,      setError]      = useState('');

  const { isOnline, pendingCount, refreshPendingCount } = useNetworkStatus();

  const loadProducts = useCallback(async (pid, online) => {
    if (online) {
      try {
        const r = await getProducts();
        const list = r.products || [];
        setProducts(list);
        await cacheProducts(pid, list);
        return;
      } catch (e) {
        if (!isNetworkError(e)) return; // real error, don't fallback silently
      }
    }
    // offline or network failure — use cache
    const cached = await getCachedProducts(pid);
    setProducts(cached);
  }, []);

  useEffect(() => {
    getPharmacyProfile()
      .then(async p => {
        setApproved(p.isApproved);
        setPharmacyId(p._id);
        if (p.isApproved) await loadProducts(p._id, true);
      })
      .catch(async () => {
        // Try profile from cache not needed here — just mark unapproved to show pending screen
        setApproved(false);
      });
  }, [loadProducts]);

  // Re-fetch when coming back online
  useEffect(() => {
    if (isOnline && pharmacyId && approved) loadProducts(pharmacyId, true);
  }, [isOnline, pharmacyId, approved, loadProducts]);

  const addProduct = async () => {
    setError('');
    if (!form.name || !form.barcode || !form.price) { setError('Name, barcode and price are required'); return; }
    setAdding(true);
    const body = {
      name: form.name, barcode: form.barcode, unit: form.unit,
      price: parseFloat(form.price), stockQty: parseInt(form.stockQty) || 0,
    };
    const optimistic = { _id: 'local_' + Date.now(), ...body, lowStockThreshold: 10, currency: 'SAR' };

    if (isOnline) {
      try {
        const p = await createProduct(body);
        setProducts(ps => [p, ...ps]);
        await upsertCachedProduct(pharmacyId, p);
        setForm({ name: '', barcode: '', price: '', stockQty: '0', unit: 'tablet' });
      } catch (e) {
        if (isNetworkError(e)) {
          setProducts(ps => [optimistic, ...ps]);
          await upsertCachedProduct(pharmacyId, optimistic);
          await enqueue({ method: 'post', path: '/products', body });
          await refreshPendingCount();
          setForm({ name: '', barcode: '', price: '', stockQty: '0', unit: 'tablet' });
        } else {
          setError(e?.message || 'Failed to add product');
        }
      }
    } else {
      setProducts(ps => [optimistic, ...ps]);
      await upsertCachedProduct(pharmacyId, optimistic);
      await enqueue({ method: 'post', path: '/products', body });
      await refreshPendingCount();
      setForm({ name: '', barcode: '', price: '', stockQty: '0', unit: 'tablet' });
    }
    setAdding(false);
  };

  const handleStock = async (id, delta) => {
    // Optimistic local update first
    const updated = await adjustCachedStock(pharmacyId, id, delta);
    if (updated) setProducts(ps => ps.map(p => p._id === id ? updated : p));

    if (isOnline) {
      try {
        const result = await adjustStock(id, delta);
        setProducts(ps => ps.map(p => p._id === id ? result : p));
        await upsertCachedProduct(pharmacyId, result);
      } catch (e) {
        if (isNetworkError(e)) {
          await enqueue({ method: 'patch', path: `/products/${id}/stock`, body: { delta } });
          await refreshPendingCount();
        } else {
          Alert.alert('Error', e?.message || 'Stock adjust failed');
          // Revert local change
          await adjustCachedStock(pharmacyId, id, -delta);
          setProducts(ps => ps.map(p => p._id === id ? { ...p, stockQty: (p.stockQty || 0) - delta } : p));
        }
      }
    } else {
      await enqueue({ method: 'patch', path: `/products/${id}/stock`, body: { delta } });
      await refreshPendingCount();
    }
  };

  const handleDelete = async (id) => {
    setProducts(ps => ps.filter(p => p._id !== id));
    await removeCachedProduct(pharmacyId, id);

    if (isOnline && !id.startsWith('local_')) {
      try {
        await import('../../api/pharmacies').then(m => m.deleteProduct ? m.deleteProduct(id) : null);
      } catch (e) {
        if (isNetworkError(e)) {
          await enqueue({ method: 'delete', path: `/products/${id}`, body: null });
          await refreshPendingCount();
        }
      }
    } else if (!id.startsWith('local_')) {
      await enqueue({ method: 'delete', path: `/products/${id}`, body: null });
      await refreshPendingCount();
    }
  };

  if (approved === null) return <View style={s.center}><ActivityIndicator color={C.mint} /></View>;

  if (!approved) return (
    <SafeAreaView style={s.safe}>
      <View style={s.center}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>⏳</Text>
        <Text style={s.heading}>Pending Approval</Text>
        <Text style={s.body}>Your pharmacy must be approved to manage inventory.</Text>
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.safe}>
      <OfflineBanner isOnline={isOnline} pendingCount={pendingCount} />
      <FlatList
        data={products}
        keyExtractor={p => p._id}
        ListHeaderComponent={
          <View style={{ padding: 20 }}>
            <Text style={s.heading}>Inventory</Text>
            <View style={s.card}>
              <Text style={s.sectionLabel}>Add Product</Text>
              {[['name', 'Name'], ['barcode', 'Barcode'], ['price', 'Price']].map(([k, l]) => (
                <View key={k} style={{ marginBottom: 10 }}>
                  <Text style={s.label}>{l}</Text>
                  <TextInput
                    style={s.input} value={form[k]}
                    onChangeText={v => setForm(f => ({ ...f, [k]: v }))}
                    keyboardType={k === 'price' ? 'decimal-pad' : 'default'}
                    placeholderTextColor={C.text3}
                  />
                </View>
              ))}
              <View style={{ marginBottom: 10 }}>
                <Text style={s.label}>Initial Stock</Text>
                <TextInput style={s.input} value={form.stockQty} onChangeText={v => setForm(f => ({ ...f, stockQty: v }))} keyboardType="number-pad" placeholderTextColor={C.text3} />
              </View>
              {!!error && <Text style={{ color: C.rose, fontSize: 12, marginBottom: 8 }}>{error}</Text>}
              <TouchableOpacity style={[s.btn, adding && { opacity: 0.6 }]} onPress={addProduct} disabled={adding}>
                <Text style={s.btnTxt}>{adding ? 'Adding…' : 'Add Product'}</Text>
              </TouchableOpacity>
            </View>
            {products.length === 0 && (
              <Text style={{ fontSize: 12, color: C.text3 }}>
                {isOnline ? 'No products yet.' : 'No data available offline.'}
              </Text>
            )}
          </View>
        }
        renderItem={({ item: p }) => (
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }}>
                {p.name}{p._id.startsWith('local_') ? ' ⏳' : ''}
              </Text>
              <Text style={{ color: C.text2, fontSize: 11, marginTop: 2 }}>#{p.barcode} · {p.price} SAR · {p.unit}</Text>
              <Text style={{ fontSize: 12, marginTop: 2, color: p.stockQty <= p.lowStockThreshold ? C.rose : C.mint }}>
                {p.stockQty} in stock{p.stockQty <= p.lowStockThreshold ? ' ⚠ Low' : ''}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity style={s.adjBtn} onPress={() => handleStock(p._id, -1)}>
                <Text style={s.adjTxt}>−</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.adjBtn} onPress={() => handleStock(p._id, 1)}>
                <Text style={s.adjTxt}>+</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.adjBtn, { borderColor: C.rose }]} onPress={() => handleDelete(p._id)}>
                <Text style={{ color: C.rose, fontSize: 14 }}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 32 }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: C.bg },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  heading:      { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 16 },
  body:         { fontSize: 14, color: C.text2, textAlign: 'center', lineHeight: 22 },
  card:         { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: C.text2, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  label:        { fontSize: 11, color: C.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  input:        { backgroundColor: C.bg3, borderRadius: 8, borderWidth: 1, borderColor: C.border2, padding: 10, color: C.text, fontSize: 13 },
  btn:          { backgroundColor: C.mint, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 4 },
  btnTxt:       { fontSize: 14, fontWeight: '700', color: '#000' },
  row:          { flexDirection: 'row', alignItems: 'center', padding: 14, marginHorizontal: 20, backgroundColor: C.bg2, borderRadius: 10, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
  adjBtn:       { backgroundColor: C.bg3, borderRadius: 8, borderWidth: 1, borderColor: C.border2, padding: 8, minWidth: 36, alignItems: 'center' },
  adjTxt:       { color: C.text, fontSize: 16, fontWeight: '600' },
});
