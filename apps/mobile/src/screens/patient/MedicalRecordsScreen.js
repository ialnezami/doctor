import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import C from '../../constants/colors';
import { getPatientMe } from '../../api/patients';
import { getPrescriptions } from '../../api/prescriptions';

function calcAge(dob) {
  if (!dob) return '—';
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

export default function MedicalRecordsScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const [patient,    setPatient]    = useState(null);
  const [rxList,     setRxList]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [selectedRx, setSelectedRx] = useState(null);

  useEffect(() => {
    Promise.allSettled([getPatientMe(), getPrescriptions()])
      .then(([patientResult, rxResult]) => {
        if (patientResult.status === 'fulfilled') setPatient(patientResult.value);
        if (rxResult.status === 'fulfilled') setRxList(Array.isArray(rxResult.value) ? rxResult.value : []);
      })
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={8}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.title}>{t('records.title')}</Text>
      </View>
      <ScrollView style={{ padding: 16 }} showsVerticalScrollIndicator={false}>

        {/* Health Profile */}
        <View style={s.profileCard}>
          <Text style={s.section}>{t('records.healthProfile')}</Text>
          <View style={s.vitals}>
            {[
              [t('records.age'),       age,              t('common.years')],
              [t('records.bloodType'), bloodType,        ''],
              [t('records.allergies'), allergies.length, t('common.recorded')],
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
                  <Text style={[s.tagTxt, { color: C.rose }]}>{a} {t('records.allergy')}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Prescriptions */}
        <Text style={s.section}>{t('records.prescriptions')}</Text>
        {rxList.length === 0 && (
          <Text style={{ color: C.text3, fontSize: 13, marginBottom: 16 }}>{t('records.noPrescriptions')}</Text>
        )}
        {rxList.map((rx, i) => {
          const meds = rx.medications?.map(m => m.name).join(', ') || '—';
          const date = rx.createdAt ? new Date(rx.createdAt).toLocaleDateString() : '';
          const docName = rx.doctorId?.name || 'Doctor';
          return (
            <TouchableOpacity key={rx._id} style={s.rxCard} onPress={() => setSelectedRx({ rx, i })}>
              <Text style={s.rxId}>RX-{String(i + 1).padStart(3, '0')}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.rxDoc}>{docName}</Text>
                <Text style={s.rxMeds}>{meds} · {date}</Text>
              </View>
              <Text style={s.rxChevron}>›</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Prescription detail modal ── */}
      <Modal
        visible={!!selectedRx}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedRx(null)}
      >
        <Pressable style={s.modalBackdrop} onPress={() => setSelectedRx(null)} />
        <View style={s.modalSheet}>
          {selectedRx && (() => {
            const { rx, i } = selectedRx;
            const docName = rx.doctorId?.name || 'Doctor';
            const date = rx.createdAt ? new Date(rx.createdAt).toLocaleDateString() : '';
            return (
              <ScrollView contentContainerStyle={{ padding: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                  <Text style={s.modalRxId}>RX-{String(i + 1).padStart(3, '0')}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.modalDoc}>{docName}</Text>
                    <Text style={s.modalDate}>{date}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedRx(null)} hitSlop={8}>
                    <Text style={{ fontSize: 22, color: C.text2 }}>✕</Text>
                  </TouchableOpacity>
                </View>

                <Text style={s.modalSection}>MEDICATIONS</Text>
                {(rx.medications || []).map((m, mi) => (
                  <View key={mi} style={s.medCard}>
                    <Text style={s.medName}>{m.name}</Text>
                    <View style={s.medMeta}>
                      {!!m.dosage    && <Text style={s.medTag}>{m.dosage}</Text>}
                      {!!m.frequency && <Text style={s.medTag}>{m.frequency}</Text>}
                      {!!m.duration  && <Text style={s.medTag}>{m.duration}</Text>}
                    </View>
                    {!!m.instructions && (
                      <Text style={s.medNote}>{m.instructions}</Text>
                    )}
                  </View>
                ))}

                {!!rx.instructions && (
                  <>
                    <Text style={[s.modalSection, { marginTop: 16 }]}>INSTRUCTIONS</Text>
                    <Text style={s.instrText}>{rx.instructions}</Text>
                  </>
                )}
              </ScrollView>
            );
          })()}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn:   { marginRight: 12 },
  backArrow: { fontSize: 32, color: C.mint, lineHeight: 34 },
  title:     { fontSize: 22, fontWeight: '700', color: C.text },
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
  rxChevron:   { fontSize: 20, color: C.text3 },
  modalBackdrop:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet:     { position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '80%', backgroundColor: C.bg2, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: C.border },
  modalRxId:      { fontSize: 11, fontFamily: 'monospace', color: C.mint, marginRight: 12 },
  modalDoc:       { fontSize: 15, fontWeight: '600', color: C.text },
  modalDate:      { fontSize: 12, color: C.text2, marginTop: 2 },
  modalSection:   { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: C.text2, marginBottom: 10 },
  medCard:        { backgroundColor: C.bg3, borderRadius: 8, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 8 },
  medName:        { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 6 },
  medMeta:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  medTag:         { fontSize: 11, color: C.mint, backgroundColor: C.mintDim, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  medNote:        { fontSize: 12, color: C.text2, marginTop: 6 },
  instrText:      { fontSize: 13, color: C.text, lineHeight: 20 },
});
