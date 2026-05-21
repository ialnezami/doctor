import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import C from '../../constants/colors';
import { getPatientMe } from '../../api/patients';
import { getPrescriptions } from '../../api/prescriptions';

function calcAge(dob) {
  if (!dob) return '—';
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

export default function MedicalRecordsScreen() {
  const [patient, setPatient] = useState(null);
  const [rxList,  setRxList]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getPatientMe(), getPrescriptions()])
      .then(([p, rx]) => { setPatient(p); setRxList(rx); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={C.mint} />
      </SafeAreaView>
    );
  }

  const age       = calcAge(patient?.dateOfBirth);
  const bloodType = patient?.bloodType || '—';
  const allergies = patient?.allergies || [];
  const conditions = patient?.conditions || [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.header}>
        <Text style={s.title}>Medical Records</Text>
      </View>
      <ScrollView style={{ padding: 16 }} showsVerticalScrollIndicator={false}>

        {/* Health Profile */}
        <View style={s.profileCard}>
          <Text style={s.section}>HEALTH PROFILE</Text>
          <View style={s.vitals}>
            {[
              ['Age',        age,                 'years'],
              ['Blood Type', bloodType,           ''],
              ['Allergies',  allergies.length,    'recorded'],
            ].map(([l, v, u]) => (
              <View key={l} style={s.vital}>
                <Text style={s.vLabel}>{l}</Text>
                <Text style={s.vValue}>{v}</Text>
                {!!u && <Text style={s.vUnit}>{u}</Text>}
              </View>
            ))}
          </View>

          {(conditions.length > 0 || allergies.length > 0) && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              {conditions.map(c => (
                <View key={c} style={s.tag}>
                  <Text style={s.tagTxt}>{c}</Text>
                </View>
              ))}
              {allergies.map(a => (
                <View key={a} style={[s.tag, s.tagDanger]}>
                  <Text style={[s.tagTxt, { color: C.rose }]}>{a} allergy</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Prescriptions */}
        <Text style={s.section}>PRESCRIPTIONS</Text>
        {rxList.length === 0 && (
          <Text style={{ color: C.text3, fontSize: 13, marginBottom: 16 }}>No prescriptions yet.</Text>
        )}
        {rxList.map((rx, i) => {
          const meds = rx.medications?.map(m => m.name).join(', ') || '—';
          const date = rx.createdAt ? new Date(rx.createdAt).toLocaleDateString() : '';
          const docName = rx.doctorId?.name || 'Doctor';
          return (
            <View key={rx._id} style={s.rxCard}>
              <Text style={s.rxId}>RX-{String(i + 1).padStart(3, '0')}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.rxDoc}>{docName}</Text>
                <Text style={s.rxMeds}>{meds} · {date}</Text>
              </View>
              <TouchableOpacity>
                <Text style={s.pdfBtn}>↓ PDF</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header:      { padding: 20, borderBottomWidth: 1, borderBottomColor: C.border },
  title:       { fontSize: 22, fontWeight: '700', color: C.text },
  section:     { fontSize: 10, fontWeight: '600', letterSpacing: 0.8, color: C.text2, marginBottom: 12, textTransform: 'uppercase' },
  profileCard: { backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 20 },
  vitals:      { flexDirection: 'row', gap: 10 },
  vital:       { flex: 1, backgroundColor: C.bg3, borderRadius: 8, borderWidth: 1, borderColor: C.border, padding: 10, alignItems: 'center' },
  vLabel:      { fontSize: 10, textTransform: 'uppercase', color: C.text3 },
  vValue:      { fontSize: 20, fontWeight: '700', color: C.text, marginVertical: 2 },
  vUnit:       { fontSize: 10, color: C.text2 },
  tag:         { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: C.bg3, borderWidth: 1, borderColor: C.border2 },
  tagDanger:   { backgroundColor: 'rgba(244,63,94,0.1)', borderColor: 'rgba(244,63,94,0.3)' },
  tagTxt:      { fontSize: 11, fontWeight: '600', color: C.text2 },
  rxCard:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: C.bg3, borderRadius: 8, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
  rxId:        { fontSize: 10, fontFamily: 'monospace', color: C.mint, minWidth: 52 },
  rxDoc:       { fontSize: 13, fontWeight: '500', color: C.text },
  rxMeds:      { fontSize: 11, color: C.text2, marginTop: 2 },
  pdfBtn:      { fontSize: 13, color: C.text2 },
});
