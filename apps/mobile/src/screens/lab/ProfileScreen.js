import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMe } from '../../api/auth';
import { getLabProfile, updateLabProfile } from '../../api/labs';
import useAuthStore from '../../store/authStore';
import AccountSection from '../../components/AccountSection';
import C from '../../constants/colors';

export default function LabProfileScreen() {
  const { user: storeUser } = useAuthStore();
  const [me, setMe] = useState(null);
  const [labName, setLabName] = useState('');
  const [address, setAddress] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [userRes, labRes] = await Promise.all([getMe(), getLabProfile()]);
      setMe(userRes);
      setLabName(labRes.labName ?? '');
      setAddress(labRes.address ?? '');
      setLicenseNumber(labRes.licenseNumber ?? '');
    } catch (err) {
      Alert.alert('Error', err?.message ?? 'Could not load lab profile');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!labName.trim()) return Alert.alert('Validation', 'Lab name cannot be empty.');
    setSaving(true);
    try {
      await updateLabProfile({
        labName: labName.trim(),
        address: address.trim(),
        licenseNumber: licenseNumber.trim(),
      });
      Alert.alert('Saved', 'Lab profile updated.');
    } catch (err) {
      Alert.alert('Error', err?.message ?? 'Could not save lab profile');
    } finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.heading}>Profile</Text>

        <AccountSection user={me ?? storeUser} />

        <Text style={s.sectionLabel}>Lab Information</Text>
        <View style={s.card}>
          <Text style={s.fieldLabel}>Lab Name</Text>
          <TextInput
            style={s.input}
            value={labName}
            onChangeText={setLabName}
            placeholder="Lab name"
            placeholderTextColor={C.text3}
          />

          <Text style={[s.fieldLabel, { marginTop: 14 }]}>Address</Text>
          <TextInput
            style={s.input}
            value={address}
            onChangeText={setAddress}
            placeholder="Clinic / lab address"
            placeholderTextColor={C.text3}
          />

          <Text style={[s.fieldLabel, { marginTop: 14 }]}>License Number</Text>
          <TextInput
            style={s.input}
            value={licenseNumber}
            onChangeText={setLicenseNumber}
            placeholder="Official license number"
            placeholderTextColor={C.text3}
          />

          <TouchableOpacity style={[s.saveBtn, { marginTop: 16 }]} onPress={handleSave} disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color="#000" />
              : <Text style={s.saveBtnTxt}>Save Lab Profile</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: C.bg },
  content:      { padding: 20, paddingBottom: 40 },
  heading:      { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: C.text3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, marginTop: 8 },
  card:         { backgroundColor: C.bg2, borderRadius: 12, padding: 16, marginBottom: 12 },
  fieldLabel:   { fontSize: 12, color: C.text3, marginBottom: 6 },
  input:        { backgroundColor: C.bg, borderRadius: 8, borderWidth: 1, borderColor: C.border, color: C.text, fontSize: 14, paddingHorizontal: 12, paddingVertical: 10 },
  saveBtn:      { backgroundColor: C.mint, borderRadius: 10, padding: 14, alignItems: 'center' },
  saveBtnTxt:   { fontSize: 14, fontWeight: '700', color: '#000' },
});
