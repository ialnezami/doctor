'use strict';
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getPharmacyProfile, updatePharmacyProfile } from '../../api/pharmacies';
import { getCachedProfile, cacheProfile } from '../../utils/localStore';
import { enqueue } from '../../utils/offlineQueue';
import useNetworkStatus from '../../hooks/useNetworkStatus';
import OfflineBanner from '../../components/OfflineBanner';
import { useColors } from '../../constants/colors';
import useThemeStore from '../../store/themeStore';

const isNetworkError = (e) =>
  !e?.response || e?.message?.includes('Network Error') || e?.code === 'ERR_NETWORK';

export default function PharmacyProfileScreen() {
  // Hooks must run before early returns
  const C = useColors();
  const { theme, setTheme } = useThemeStore();
  const s = makeStyles(C);

  const [approved,   setApproved]   = useState(null);
  const [pharmacyId, setPharmacyId] = useState(null);
  const [form,       setForm]       = useState({ pharmacyName: '', licenseNumber: '', address: '' });
  const [saving,     setSaving]     = useState(false);
  const [msg,        setMsg]        = useState('');

  const { isOnline, pendingCount, refreshPendingCount } = useNetworkStatus();

  useEffect(() => {
    async function load() {
      try {
        const p = await getPharmacyProfile();
        setApproved(p.isApproved);
        setPharmacyId(p._id);
        setForm({ pharmacyName: p.pharmacyName || '', licenseNumber: p.licenseNumber || '', address: p.address || '' });
        await cacheProfile(p._id, p);
      } catch (e) {
        if (isNetworkError(e)) {
          const cached = await getCachedProfile('__pharmacy__');
          if (cached) {
            setApproved(cached.isApproved);
            setPharmacyId(cached._id);
            setForm({ pharmacyName: cached.pharmacyName || '', licenseNumber: cached.licenseNumber || '', address: cached.address || '' });
          } else {
            setApproved(false);
          }
        } else {
          setApproved(false);
        }
      }
    }
    load();
  }, []);

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      if (isOnline) {
        const updated = await updatePharmacyProfile(form);
        if (pharmacyId) await cacheProfile(pharmacyId, { ...updated, isApproved: approved });
        setMsg('Profile saved.');
      } else {
        if (pharmacyId) await cacheProfile(pharmacyId, { _id: pharmacyId, ...form, isApproved: approved });
        await enqueue({ method: 'patch', path: '/pharmacies/me', body: form });
        await refreshPendingCount();
        setMsg('Saved offline — will sync when connected.');
      }
    } catch (e) {
      if (isNetworkError(e)) {
        if (pharmacyId) await cacheProfile(pharmacyId, { _id: pharmacyId, ...form, isApproved: approved });
        await enqueue({ method: 'patch', path: '/pharmacies/me', body: form });
        await refreshPendingCount();
        setMsg('Saved offline — will sync when connected.');
      } else {
        setMsg(e?.message || 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  };

  if (approved === null) return <View style={s.center}><ActivityIndicator color={C.mint} /></View>;

  if (!approved) return (
    <SafeAreaView style={s.safe}>
      <View style={s.center}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>⏳</Text>
        <Text style={s.heading}>Pending Approval</Text>
        <Text style={s.body}>An administrator needs to approve your pharmacy before you can start operations.</Text>
      </View>
    </SafeAreaView>
  );

  const fields = [['pharmacyName', 'Pharmacy Name'], ['licenseNumber', 'License Number'], ['address', 'Address']];

  return (
    <SafeAreaView style={s.safe}>
      <OfflineBanner isOnline={isOnline} pendingCount={pendingCount} />
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={s.heading}>Profile</Text>

        <View style={s.card}>
          {fields.map(([k, l]) => (
            <View key={k} style={{ marginBottom: 14 }}>
              <Text style={s.label}>{l}</Text>
              <TextInput
                style={s.input}
                value={form[k]}
                onChangeText={v => setForm(f => ({ ...f, [k]: v }))}
                placeholderTextColor={C.text3}
              />
            </View>
          ))}
          {!!msg && (
            <Text style={{ fontSize: 13, marginBottom: 10, color: msg.includes('failed') ? C.rose : C.mint }}>
              {msg}
            </Text>
          )}
          <TouchableOpacity style={[s.btn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
            <Text style={s.btnTxt}>{saving ? 'Saving…' : 'Save Profile'}</Text>
          </TouchableOpacity>
        </View>

        {/* Appearance */}
        <Text style={s.sectionLabel}>Appearance</Text>
        <View style={s.card}>
          <Text style={s.label}>Theme</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            {[
              { value: 'dark',  label: '🌙 Night' },
              { value: 'light', label: '☀️ Light' },
            ].map(opt => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setTheme(opt.value)}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center',
                  borderWidth: theme === opt.value ? 1.5 : 1,
                  borderColor: theme === opt.value ? C.mint : C.border,
                  backgroundColor: theme === opt.value ? C.mintDim : C.bg3,
                }}
                accessibilityLabel={`${opt.label} theme`}
                accessibilityRole="button"
              >
                <Text style={{
                  fontSize: 13,
                  fontWeight: theme === opt.value ? '600' : '400',
                  color: theme === opt.value ? C.mint : C.text2,
                }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C) {
  return {
    safe:        { flex: 1, backgroundColor: C.bg },
    center:      { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    heading:     { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 16 },
    body:        { fontSize: 14, color: C.text2, textAlign: 'center', lineHeight: 22 },
    sectionLabel:{ fontSize: 11, fontWeight: '700', color: C.text3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6, marginTop: 16 },
    card:        { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 12 },
    label:       { fontSize: 11, color: C.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
    input:       { backgroundColor: C.bg3, borderRadius: 8, borderWidth: 1, borderColor: C.border2, padding: 10, color: C.text, fontSize: 13 },
    btn:         { backgroundColor: C.mint, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 4 },
    btnTxt:      { fontSize: 14, fontWeight: '700', color: '#000' },
  };
}
