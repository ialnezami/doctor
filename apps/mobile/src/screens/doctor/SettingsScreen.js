import React, { useState, useEffect } from 'react';
import { View, Text, Switch, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyDoctorProfile, updateDoctorSettings } from '../../api/doctors';
import C from '../../constants/colors';

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function SettingsScreen() {
  const [doctorId, setDoctorId] = useState(null);
  const [autoAccept, setAutoAccept] = useState(false);
  const [slots, setSlots] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getMyDoctorProfile().then(doc => {
      setDoctorId(doc._id);
      setAutoAccept(doc.autoAcceptAppointments || false);
      setSlots(doc.availabilitySlots || []);
    }).catch(() => {});
  }, []);

  const save = async () => {
    if (!doctorId) return;
    setSaving(true);
    try {
      await updateDoctorSettings(doctorId, { autoAcceptAppointments: autoAccept, availabilitySlots: slots });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {} finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.heading}>Settings</Text>

        <View style={s.card}>
          <View style={s.row}>
            <View style={{ flex:1 }}>
              <Text style={s.rowTitle}>Auto-accept appointments</Text>
              <Text style={s.rowSub}>Confirm bookings immediately without review</Text>
            </View>
            <Switch value={autoAccept} onValueChange={setAutoAccept} trackColor={{ true: C.mint }} />
          </View>
        </View>

        <Text style={s.sectionLabel}>Availability</Text>
        <View style={s.card}>
          {slots.length === 0 && <Text style={{ fontSize:12, color:C.text3, marginBottom:8 }}>No availability set.</Text>}
          {slots.map((sl, i) => (
            <View key={i} style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:10 }}>
              <Text style={{ fontSize:12, color:C.text2, width:34 }}>{DAYS[sl.dayOfWeek]}</Text>
              <Text style={s.slotTime}>{sl.startTime}</Text>
              <Text style={{ fontSize:11, color:C.text3 }}>–</Text>
              <Text style={s.slotTime}>{sl.endTime}</Text>
              <TouchableOpacity onPress={() => setSlots(ss => ss.filter((_,idx) => idx!==i))} style={{ marginLeft:'auto' }}>
                <Text style={{ color:C.rose, fontSize:18, lineHeight:20 }}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity onPress={() => setSlots(ss => [...ss, { dayOfWeek:1, startTime:'09:00', endTime:'17:00' }])}
            style={s.addBtn}>
            <Text style={s.addBtnTxt}>+ Add day</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[s.saveBtn, saving && { opacity:0.6 }]} onPress={save} disabled={saving}>
          <Text style={s.saveBtnTxt}>{saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Settings'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex:1, backgroundColor:C.bg },
  content: { padding:20 },
  heading: { fontSize:22, fontWeight:'700', color:C.text, marginBottom:20 },
  card: { backgroundColor:C.card, borderRadius:12, borderWidth:1, borderColor:C.border, padding:16, marginBottom:16 },
  row: { flexDirection:'row', alignItems:'center', gap:12 },
  rowTitle: { fontSize:14, fontWeight:'500', color:C.text },
  rowSub: { fontSize:12, color:C.text2, marginTop:2 },
  sectionLabel: { fontSize:11, fontWeight:'600', color:C.text2, textTransform:'uppercase', letterSpacing:0.5, marginBottom:8 },
  slotTime: { fontSize:12, color:C.text, backgroundColor:C.bg3, paddingHorizontal:8, paddingVertical:4, borderRadius:6 },
  addBtn: { marginTop:4 },
  addBtnTxt: { fontSize:13, color:C.mint },
  saveBtn: { backgroundColor:C.mint, borderRadius:12, padding:14, alignItems:'center', marginTop:8 },
  saveBtnTxt: { fontSize:15, fontWeight:'700', color:'#000' },
});
