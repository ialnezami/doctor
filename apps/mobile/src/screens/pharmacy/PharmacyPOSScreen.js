import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getPharmacyProfile, createSale, getSales } from '../../api/pharmacies';
import { cacheSales, getCachedSales, addCachedSale, adjustCachedStock } from '../../utils/localStore';
import { enqueue } from '../../utils/offlineQueue';
import useNetworkStatus from '../../hooks/useNetworkStatus';
import OfflineBanner from '../../components/OfflineBanner';
import C from '../../constants/colors';

const isNetworkError = (e) =>
  !e?.response || e?.message?.includes('Network Error') || e?.code === 'ERR_NETWORK';

export default function PharmacyPOSScreen() {
  const [approved,    setApproved]    = useState(null);
  const [pharmacyId,  setPharmacyId]  = useState(null);
  const [sales,       setSales]       = useState([]);
  const [items,       setItems]       = useState([{ name: '', qty: '1', unitPrice: '0' }]);
  const [meta,        setMeta]        = useState({ patientId: '', prescriptionId: '', paymentMethod: 'cash', currency: 'SAR' });
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');
  const [successMsg,  setSuccessMsg]  = useState('');

  const { isOnline, pendingCount, refreshPendingCount } = useNetworkStatus();

  const loadSales = useCallback(async (pid, online) => {
    if (online) {
      try {
        const r = await getSales();
        const list = r.sales || [];
        setSales(list);
        await cacheSales(pid, list);
        return;
      } catch (e) {
        if (!isNetworkError(e)) return;
      }
    }
    const cached = await getCachedSales(pid);
    setSales(cached);
  }, []);

  useEffect(() => {
    getPharmacyProfile()
      .then(async p => {
        setApproved(p.isApproved);
        setPharmacyId(p._id);
        if (p.isApproved) await loadSales(p._id, true);
      })
      .catch(() => setApproved(false));
  }, [loadSales]);

  useEffect(() => {
    if (isOnline && pharmacyId && approved) loadSales(pharmacyId, true);
  }, [isOnline, pharmacyId, approved, loadSales]);

  const totalAmount = items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unitPrice) || 0), 0);

  const addItem    = () => setItems(is => [...is, { name: '', qty: '1', unitPrice: '0' }]);
  const removeItem = (idx) => setItems(is => is.filter((_, i) => i !== idx));
  const setField   = (idx, key, val) => setItems(is => is.map((it, i) => i === idx ? { ...it, [key]: val } : it));

  const submit = async () => {
    setError(''); setSuccessMsg('');
    const validItems = items.filter(i => i.name.trim());
    if (!validItems.length) { setError('Add at least one item with a name'); return; }
    setSubmitting(true);

    const saleBody = {
      items: validItems.map(i => ({ name: i.name.trim(), qty: parseInt(i.qty) || 1, unitPrice: parseFloat(i.unitPrice) || 0 })),
      paymentMethod: meta.paymentMethod,
      totalAmount,
      currency: meta.currency,
      ...(meta.patientId.trim()      && { patientId:      meta.patientId.trim() }),
      ...(meta.prescriptionId.trim() && { prescriptionId: meta.prescriptionId.trim() }),
    };

    const optimistic = {
      _id: 'local_' + Date.now(),
      ...saleBody,
      receiptNumber: 'PENDING-' + Date.now(),
      createdAt: new Date().toISOString(),
    };

    if (isOnline) {
      try {
        const sale = await createSale(saleBody);
        setSales(s => [sale, ...s]);
        await addCachedSale(pharmacyId, sale);
        setItems([{ name: '', qty: '1', unitPrice: '0' }]);
        setMeta(m => ({ ...m, patientId: '', prescriptionId: '' }));
        setSuccessMsg('Sale complete!');
      } catch (e) {
        if (isNetworkError(e)) {
          await queueOfflineSale(optimistic, saleBody);
        } else {
          setError(e?.message || 'Sale failed');
        }
      }
    } else {
      await queueOfflineSale(optimistic, saleBody);
    }
    setSubmitting(false);
  };

  async function queueOfflineSale(optimistic, saleBody) {
    setSales(s => [optimistic, ...s]);
    await addCachedSale(pharmacyId, optimistic);
    // Optimistically deduct stock for items with productId
    for (const item of saleBody.items) {
      if (item.productId) await adjustCachedStock(pharmacyId, item.productId, -item.qty);
    }
    await enqueue({ method: 'post', path: '/sales', body: saleBody });
    await refreshPendingCount();
    setItems([{ name: '', qty: '1', unitPrice: '0' }]);
    setMeta(m => ({ ...m, patientId: '', prescriptionId: '' }));
    setSuccessMsg('Saved offline — will sync when connected.');
  }

  if (approved === null) return <View style={s.center}><ActivityIndicator color={C.mint} /></View>;

  if (!approved) return (
    <SafeAreaView style={s.safe}>
      <View style={s.center}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>⏳</Text>
        <Text style={s.heading}>Pending Approval</Text>
        <Text style={s.body}>Your pharmacy must be approved before you can process sales.</Text>
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.safe}>
      <OfflineBanner isOnline={isOnline} pendingCount={pendingCount} />
      <FlatList
        data={sales}
        keyExtractor={sale => sale._id}
        ListHeaderComponent={
          <View style={{ padding: 20 }}>
            <Text style={s.heading}>Point of Sale</Text>

            <View style={s.card}>
              <Text style={s.sectionLabel}>Optional</Text>
              <View style={{ marginBottom: 10 }}>
                <Text style={s.label}>Patient ID</Text>
                <TextInput style={s.input} value={meta.patientId} onChangeText={v => setMeta(m => ({ ...m, patientId: v }))} placeholderTextColor={C.text3} />
              </View>
              <View style={{ marginBottom: 10 }}>
                <Text style={s.label}>Prescription ID</Text>
                <TextInput style={s.input} value={meta.prescriptionId} onChangeText={v => setMeta(m => ({ ...m, prescriptionId: v }))} placeholderTextColor={C.text3} />
              </View>
              <Text style={s.label}>Payment Method</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                {['cash', 'card'].map(m => (
                  <TouchableOpacity key={m} onPress={() => setMeta(mm => ({ ...mm, paymentMethod: m }))}
                    style={[s.payBtn, meta.paymentMethod === m && s.payBtnActive]}>
                    <Text style={{ color: meta.paymentMethod === m ? '#000' : C.text2, fontWeight: '600', fontSize: 13 }}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={s.card}>
              <Text style={s.sectionLabel}>Items</Text>
              {items.map((item, idx) => (
                <View key={idx} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={s.label}>Item {idx + 1}</Text>
                    {items.length > 1 && (
                      <TouchableOpacity onPress={() => removeItem(idx)}>
                        <Text style={{ color: C.rose, fontSize: 12 }}>Remove</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <TextInput style={[s.input, { marginBottom: 6 }]} placeholder="Name" value={item.name} onChangeText={v => setField(idx, 'name', v)} placeholderTextColor={C.text3} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.label}>Qty</Text>
                      <TextInput style={s.input} keyboardType="number-pad" value={item.qty} onChangeText={v => setField(idx, 'qty', v)} placeholderTextColor={C.text3} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.label}>Unit Price</Text>
                      <TextInput style={s.input} keyboardType="decimal-pad" value={item.unitPrice} onChangeText={v => setField(idx, 'unitPrice', v)} placeholderTextColor={C.text3} />
                    </View>
                  </View>
                </View>
              ))}
              <TouchableOpacity style={[s.btn, { backgroundColor: C.bg3, marginBottom: 12 }]} onPress={addItem}>
                <Text style={{ color: C.text, fontWeight: '700', fontSize: 14 }}>+ Add Item</Text>
              </TouchableOpacity>

              <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 12 }}>
                Total: {totalAmount.toFixed(2)} {meta.currency}
              </Text>

              {!!error      && <Text style={{ color: C.rose, fontSize: 12, marginBottom: 8 }}>{error}</Text>}
              {!!successMsg && <Text style={{ color: C.mint, fontSize: 12, marginBottom: 8 }}>{successMsg}</Text>}
              <TouchableOpacity style={[s.btn, submitting && { opacity: 0.6 }]} onPress={submit} disabled={submitting}>
                <Text style={s.btnTxt}>{submitting ? 'Processing…' : 'Complete Sale'}</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.sectionLabel}>Recent Sales</Text>
            {sales.length === 0 && (
              <Text style={{ fontSize: 12, color: C.text3 }}>
                {isOnline ? 'No sales yet.' : 'No data available offline.'}
              </Text>
            )}
          </View>
        }
        renderItem={({ item: sale }) => (
          <View style={s.saleRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }}>
                #{sale.receiptNumber}
                {sale._id?.startsWith('local_') ? ' ⏳' : ''}
              </Text>
              <Text style={{ color: C.text2, fontSize: 11, marginTop: 2 }}>{sale.items?.length} item(s) · {sale.paymentMethod}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }}>{sale.totalAmount?.toFixed(2)} {sale.currency}</Text>
              <Text style={{ color: C.text3, fontSize: 11 }}>{new Date(sale.createdAt).toLocaleDateString()}</Text>
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
  card:         { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: C.text2, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  label:        { fontSize: 11, color: C.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  input:        { backgroundColor: C.bg3, borderRadius: 8, borderWidth: 1, borderColor: C.border2, padding: 10, color: C.text, fontSize: 13 },
  btn:          { backgroundColor: C.mint, borderRadius: 10, padding: 12, alignItems: 'center' },
  btnTxt:       { fontSize: 14, fontWeight: '700', color: '#000' },
  payBtn:       { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: C.border2, backgroundColor: C.bg3 },
  payBtnActive: { backgroundColor: C.mint, borderColor: C.mint },
  saleRow:      { flexDirection: 'row', alignItems: 'center', padding: 14, marginHorizontal: 20, backgroundColor: C.bg2, borderRadius: 10, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
});
