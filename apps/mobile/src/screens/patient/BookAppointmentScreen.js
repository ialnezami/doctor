import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createAppointment } from '../../api/appointments';
import C from '../../constants/colors';

const VISIT_TYPES = ['initial','follow-up','check-up','urgent'];

function addThirtyMin(time) {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + 30;
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}

export default function BookAppointmentScreen({ route, navigation }) {
  const { doctorUserId, doctorName, specialty, date, slot } = route.params;
  const [visitType, setVisitType] = useState('initial');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setLoading(true); setError('');
    try {
      const appt = await createAppointment({
        doctorId: doctorUserId,
        date,
        timeSlot: { start: slot, end: addThirtyMin(slot) },
        visitType,
        reason,
      });
      navigation.replace('SymptomInput', {
        appointmentId: appt._id || appt.id,
        status: appt.status,
      });
    } catch (e) {
      setError(e.message || 'Booking failed — slot may be taken');
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom:16 }}>
          <Text style={{ color:C.mint, fontSize:14 }}>← Back</Text>
        </TouchableOpacity>

        <Text style={s.heading}>Confirm Booking</Text>

        <View style={s.summary}>
          <Text style={s.label}>Doctor</Text>
          <Text style={s.value}>{doctorName}</Text>
          <Text style={s.subValue}>{specialty}</Text>
          <View style={{ flexDirection:'row', gap:24, marginTop:12 }}>
            <View><Text style={s.label}>Date</Text><Text style={s.value}>{date}</Text></View>
            <View><Text style={s.label}>Time</Text><Text style={s.value}>{slot}</Text></View>
          </View>
        </View>

        <Text style={s.sectionLabel}>Visit Type</Text>
        <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom:20 }}>
          {VISIT_TYPES.map(t => (
            <TouchableOpacity key={t} onPress={() => setVisitType(t)}
              style={[s.typeChip, visitType===t && s.typeChipActive]}>
              <Text style={[s.typeChipTxt, visitType===t && s.typeChipTxtActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.sectionLabel}>Reason (optional)</Text>
        <TextInput
          style={s.textarea} value={reason} onChangeText={setReason}
          placeholder="Briefly describe your symptoms…" placeholderTextColor={C.text3}
          multiline numberOfLines={3} />

        {!!error && <Text style={{ color:C.rose, fontSize:13, marginBottom:12 }}>{error}</Text>}

        <TouchableOpacity style={[s.btn, loading && { opacity:0.6 }]} onPress={submit} disabled={loading}>
          <Text style={s.btnTxt}>{loading ? 'Booking…' : 'Request Appointment'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex:1, backgroundColor:C.bg },
  content: { padding:20, paddingTop:12 },
  heading: { fontSize:22, fontWeight:'700', color:C.text, marginBottom:20 },
  summary: { backgroundColor:C.card, borderRadius:12, borderWidth:1, borderColor:C.border, padding:18, marginBottom:24 },
  label: { fontSize:11, color:C.text3, textTransform:'uppercase', letterSpacing:0.5, marginBottom:2 },
  value: { fontSize:15, fontWeight:'600', color:C.text },
  subValue: { fontSize:12, color:C.mint, marginTop:2 },
  sectionLabel: { fontSize:11, fontWeight:'600', color:C.text2, textTransform:'uppercase', letterSpacing:0.5, marginBottom:8 },
  typeChip: { paddingHorizontal:14, paddingVertical:7, borderRadius:20, borderWidth:1, borderColor:C.border2 },
  typeChipActive: { borderColor:C.mint, backgroundColor:C.bg3 },
  typeChipTxt: { fontSize:12.5, color:C.text2, textTransform:'capitalize' },
  typeChipTxtActive: { color:C.mint, fontWeight:'600' },
  textarea: { backgroundColor:C.bg2, borderWidth:1, borderColor:C.border2, borderRadius:10, padding:12, color:C.text, fontSize:13, marginBottom:20, minHeight:80, textAlignVertical:'top' },
  btn: { backgroundColor:C.mint, borderRadius:12, padding:14, alignItems:'center' },
  btnTxt: { fontSize:15, fontWeight:'700', color:'#000' },
});
