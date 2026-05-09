import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDoctor, getAvailableSlots } from '../../api/doctors';
import C from '../../constants/colors';

function toISO(d) { return d.toISOString().slice(0,10); }
function dateLabel(d) { return d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' }); }

export default function DoctorProfileScreen({ route, navigation }) {
  const { doctorId } = route.params;
  const [doctor, setDoctor] = useState(null);
  const [selectedDate, setSelectedDate] = useState(toISO(new Date()));
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i); return d;
  });

  useEffect(() => { getDoctor(doctorId).then(setDoctor).catch(() => {}); }, [doctorId]);

  useEffect(() => {
    setSlotsLoading(true);
    getAvailableSlots(doctorId, selectedDate)
      .then(setSlots)
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [doctorId, selectedDate]);

  if (!doctor) return <View style={s.center}><ActivityIndicator color={C.mint} /></View>;

  const name = doctor.userId?.name || 'Doctor';

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding:16 }}>
          <Text style={{ color:C.mint, fontSize:14 }}>← Back</Text>
        </TouchableOpacity>

        <View style={s.card}>
          <View style={s.avatar}><Text style={s.avatarTxt}>{name.split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('')}</Text></View>
          <Text style={s.name}>{name}</Text>
          <Text style={s.specialty}>{doctor.specialty}</Text>
          {doctor.bio ? <Text style={s.bio}>{doctor.bio}</Text> : null}
          <View style={{ flexDirection:'row', gap:16, marginTop:10 }}>
            {doctor.consultationFee > 0 && <Text style={s.meta}>{doctor.consultationFee} SAR</Text>}
            {doctor.yearsOfExperience > 0 && <Text style={s.meta}>{doctor.yearsOfExperience}y exp</Text>}
          </View>
        </View>

        <Text style={s.sectionTitle}>Pick a date</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal:16, marginBottom:16 }}>
          {days.map(d => {
            const iso = toISO(d);
            const active = iso === selectedDate;
            return (
              <TouchableOpacity key={iso} onPress={() => setSelectedDate(iso)}
                style={[s.dateChip, active && s.dateChipActive]}>
                <Text style={[s.dateChipTxt, active && s.dateChipTxtActive]}>{dateLabel(d)}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={s.sectionTitle}>Available times</Text>
        {slotsLoading && <ActivityIndicator color={C.mint} style={{ margin:16 }} />}
        {!slotsLoading && slots.length === 0 && (
          <Text style={s.empty}>No availability on this day.</Text>
        )}
        <View style={s.slotsGrid}>
          {slots.map(sl => (
            <TouchableOpacity key={sl.time} disabled={!sl.available}
              onPress={() => navigation.navigate('BookAppointment', {
                doctorId,
                doctorName: name,
                specialty: doctor.specialty,
                date: selectedDate,
                slot: sl.time,
              })}
              style={[s.slotBtn, !sl.available && s.slotBtnTaken]}>
              <Text style={[s.slotTxt, !sl.available && s.slotTxtTaken]}>{sl.time}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex:1, backgroundColor:C.bg },
  center: { flex:1, justifyContent:'center', alignItems:'center', backgroundColor:C.bg },
  card: { margin:16, padding:20, backgroundColor:C.card, borderRadius:14, borderWidth:1, borderColor:C.border, alignItems:'center' },
  avatar: { width:64, height:64, borderRadius:32, backgroundColor:C.mint, justifyContent:'center', alignItems:'center', marginBottom:12 },
  avatarTxt: { fontSize:22, fontWeight:'700', color:'#000' },
  name: { fontSize:18, fontWeight:'700', color:C.text },
  specialty: { fontSize:13, color:C.mint, marginTop:4 },
  bio: { fontSize:12.5, color:C.text2, marginTop:8, textAlign:'center' },
  meta: { fontSize:12, color:C.text3, backgroundColor:C.bg3, paddingHorizontal:10, paddingVertical:4, borderRadius:10 },
  sectionTitle: { fontSize:13, fontWeight:'600', color:C.text2, marginHorizontal:16, marginBottom:8 },
  dateChip: { paddingHorizontal:14, paddingVertical:8, borderRadius:10, borderWidth:1, borderColor:C.border2, backgroundColor:C.bg2, marginRight:8 },
  dateChipActive: { borderColor:C.mint, backgroundColor:C.bg3 },
  dateChipTxt: { fontSize:12, color:C.text2 },
  dateChipTxtActive: { color:C.mint, fontWeight:'600' },
  slotsGrid: { flexDirection:'row', flexWrap:'wrap', paddingHorizontal:16, gap:8 },
  slotBtn: { paddingHorizontal:16, paddingVertical:9, borderRadius:20, borderWidth:1, borderColor:C.mint, backgroundColor:C.bg3 },
  slotBtnTaken: { borderColor:C.border, opacity:0.4 },
  slotTxt: { fontSize:13, color:C.mint, fontWeight:'500' },
  slotTxtTaken: { color:C.text3 },
  empty: { fontSize:12, color:C.text3, marginHorizontal:16, marginBottom:16 },
});
