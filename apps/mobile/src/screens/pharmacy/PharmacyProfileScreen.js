import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getPharmacyProfile, updatePharmacyProfile } from '../../api/pharmacies';
import C from '../../constants/colors';

export default function PharmacyProfileScreen() {
  const [approved, setApproved] = useState(null);
  const [form,     setForm]     = useState({ pharmacyName: '', licenseNumber: '', address: '' });
  const [saving,   setSaving]   = useState(false);
  const [msg,      setMsg]      = useState('');

  useEffect(() => {
    getPharmacyProfile()
      .then(p => {
        setApproved(p.isApproved);
        setForm({ pharmacyName: p.pharmacyName || '', licenseNumber: p.licenseNumber || '', address: p.address || '' });
      })
      .catch(() => setApproved(false));
  }, []);

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      await updatePharmacyProfile(form);
      setMsg('Profile saved.');
    } catch (e) { setMsg(e?.message || 'Save failed'); }
    finally { setSaving(false); }
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
          {!!msg && <Text style={{ fontSize: 13, marginBottom: 10, color: msg.includes('saved') ? C.mint : C.rose }}>{msg}</Text>}
          <TouchableOpacity style={[s.btn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
            <Text style={s.btnTxt}>{saving ? 'Saving…' : 'Save Profile'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  heading: { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 16 },
  body:    { fontSize: 14, color: C.text2, textAlign: 'center', lineHeight: 22 },
  card:    { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 20 },
  label:   { fontSize: 11, color: C.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  input:   { backgroundColor: C.bg3, borderRadius: 8, borderWidth: 1, borderColor: C.border2, padding: 10, color: C.text, fontSize: 13 },
  btn:     { backgroundColor: C.mint, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 4 },
  btnTxt:  { fontSize: 14, fontWeight: '700', color: '#000' },
});
