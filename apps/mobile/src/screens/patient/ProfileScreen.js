import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMe } from '../../api/auth';
import { getPatientMe, updatePatientProfile } from '../../api/patients';
import useAuthStore from '../../store/authStore';
import AccountSection from '../../components/AccountSection';
import C from '../../constants/colors';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function ProfileScreen() {
  const { user: storeUser } = useAuthStore();
  const [me, setMe] = useState(null);
  const [saving, setSaving] = useState(false);

  const [bloodType, setBloodType] = useState('');
  const [dob, setDob] = useState('');
  const [allergies, setAllergies] = useState('');
  const [conditions, setConditions] = useState('');

  const load = useCallback(async () => {
    try {
      const [userRes, profRes] = await Promise.all([getMe(), getPatientMe()]);
      setMe(userRes);
      setBloodType(profRes.bloodType ?? '');
      setDob(profRes.dateOfBirth ? profRes.dateOfBirth.slice(0, 10) : '');
      setAllergies((profRes.allergies ?? []).join(', '));
      setConditions((profRes.conditions ?? []).join(', '));
    } catch (err) {
      Alert.alert('Error', err?.message ?? 'Could not load profile');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await updatePatientProfile({
        bloodType: bloodType || undefined,
        dateOfBirth: dob || undefined,
        allergies: allergies ? allergies.split(',').map(s => s.trim()).filter(Boolean) : [],
        conditions: conditions ? conditions.split(',').map(s => s.trim()).filter(Boolean) : [],
      });
      Alert.alert('Saved', 'Medical profile updated.');
    } catch (err) {
      Alert.alert('Error', err?.message ?? 'Could not save profile');
    } finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.heading}>Profile</Text>

        <AccountSection user={me ?? storeUser} />

        <Text style={s.sectionLabel}>Medical Profile</Text>
        <View style={s.card}>
          <Text style={s.fieldLabel}>Blood Type</Text>
          <View style={s.chips}>
            {BLOOD_TYPES.map(bt => (
              <TouchableOpacity
                key={bt}
                style={[s.chip, bloodType === bt && s.chipActive]}
                onPress={() => setBloodType(bt === bloodType ? '' : bt)}
              >
                <Text style={[s.chipTxt, bloodType === bt && s.chipTxtActive]}>{bt}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[s.fieldLabel, { marginTop: 14 }]}>Date of Birth (YYYY-MM-DD)</Text>
          <TextInput
            style={s.input}
            value={dob}
            onChangeText={setDob}
            placeholder="e.g. 1990-06-15"
            placeholderTextColor={C.text3}
            keyboardType="numbers-and-punctuation"
          />

          <Text style={[s.fieldLabel, { marginTop: 14 }]}>Allergies (comma-separated)</Text>
          <TextInput
            style={s.input}
            value={allergies}
            onChangeText={setAllergies}
            placeholder="e.g. Penicillin, Pollen"
            placeholderTextColor={C.text3}
          />

          <Text style={[s.fieldLabel, { marginTop: 14 }]}>Conditions (comma-separated)</Text>
          <TextInput
            style={s.input}
            value={conditions}
            onChangeText={setConditions}
            placeholder="e.g. Diabetes, Hypertension"
            placeholderTextColor={C.text3}
          />

          <TouchableOpacity style={[s.saveBtn, { marginTop: 16 }]} onPress={handleSaveProfile} disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color="#000" />
              : <Text style={s.saveBtnTxt}>Save Medical Profile</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: C.bg },
  content:       { padding: 20, paddingBottom: 40 },
  heading:       { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 20 },
  sectionLabel:  { fontSize: 11, fontWeight: '700', color: C.text3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, marginTop: 8 },
  card:          { backgroundColor: C.bg2, borderRadius: 12, padding: 16, marginBottom: 12 },
  fieldLabel:    { fontSize: 12, color: C.text3, marginBottom: 6 },
  input:         { backgroundColor: C.bg, borderRadius: 8, borderWidth: 1, borderColor: C.border, color: C.text, fontSize: 14, paddingHorizontal: 12, paddingVertical: 10 },
  chips:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  chip:          { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: C.border },
  chipActive:    { backgroundColor: C.mint, borderColor: C.mint },
  chipTxt:       { fontSize: 13, color: C.text2 },
  chipTxtActive: { color: '#000', fontWeight: '600' },
  saveBtn:       { backgroundColor: C.mint, borderRadius: 10, padding: 14, alignItems: 'center' },
  saveBtnTxt:    { fontSize: 14, fontWeight: '700', color: '#000' },
});
