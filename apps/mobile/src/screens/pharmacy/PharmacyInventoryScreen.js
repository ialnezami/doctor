import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getPharmacyProfile, getProducts, createProduct, adjustStock } from '../../api/pharmacies';
import C from '../../constants/colors';

const UNIT_OPTIONS = ['tablet', 'capsule', 'ml', 'mg', 'box', 'sachet', 'other'];

export default function PharmacyInventoryScreen() {
  const [approved,   setApproved]   = useState(null);
  const [products,   setProducts]   = useState([]);
  const [form,       setForm]       = useState({ name: '', barcode: '', price: '', stockQty: '0', unit: 'tablet' });
  const [adding,     setAdding]     = useState(false);
  const [error,      setError]      = useState('');

  useEffect(() => {
    getPharmacyProfile()
      .then(p => {
        setApproved(p.isApproved);
        if (p.isApproved) {
          return getProducts().then(r => setProducts(r.products || []));
        }
      })
      .catch(() => setApproved(false));
  }, []);

  const addProduct = async () => {
    setError('');
    if (!form.name || !form.barcode || !form.price) { setError('Name, barcode and price are required'); return; }
    setAdding(true);
    try {
      const p = await createProduct({
        name: form.name, barcode: form.barcode, unit: form.unit,
        price: parseFloat(form.price), stockQty: parseInt(form.stockQty) || 0,
      });
      setProducts(ps => [p, ...ps]);
      setForm({ name: '', barcode: '', price: '', stockQty: '0', unit: 'tablet' });
    } catch (e) { setError(e?.message || 'Failed to add product'); }
    finally { setAdding(false); }
  };

  const handleStock = async (id, delta) => {
    try {
      const updated = await adjustStock(id, delta);
      setProducts(ps => ps.map(p => p._id === id ? updated : p));
    } catch (e) { Alert.alert('Error', e?.message || 'Stock adjust failed'); }
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
            {products.length === 0 && <Text style={{ fontSize: 12, color: C.text3 }}>No products yet.</Text>}
          </View>
        }
        renderItem={({ item: p }) => (
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }}>{p.name}</Text>
              <Text style={{ color: C.text2, fontSize: 11, marginTop: 2 }}>#{p.barcode} · {p.price} SAR · {p.unit}</Text>
              <Text style={{ fontSize: 12, marginTop: 2, color: p.stockQty <= p.lowStockThreshold ? C.rose : C.mint }}>
                {p.stockQty} in stock{p.stockQty <= p.lowStockThreshold ? ' ⚠ Low' : ''}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={s.adjBtn} onPress={() => handleStock(p._id, -1)}>
                <Text style={s.adjTxt}>−</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.adjBtn} onPress={() => handleStock(p._id, 1)}>
                <Text style={s.adjTxt}>+</Text>
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
