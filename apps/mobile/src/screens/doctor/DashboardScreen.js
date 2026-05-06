import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import C from '../../constants/colors';
import { getAppointments } from '../../api/appointments';
import useAuthStore from '../../store/authStore';

const Stat = ({ label, value, color }) => (
  <View style={[s.stat, { borderTopColor: color }]}>
    <Text style={s.statLabel}>{label}</Text>
    <Text style={[s.statValue, { color }]}>{value}</Text>
  </View>
);

export default function DashboardScreen() {
  const { user } = useAuthStore();
  const [appts, setAppts] = useState([]);
  useEffect(() => { getAppointments().then(setAppts).catch(() => {}); }, []);
  const today = appts.filter(a => new Date(a.date).toDateString() === new Date().toDateString());
  const pending = appts.filter(a => a.status === 'pending');

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.container}>
        <Text style={s.greeting}>Good morning,</Text>
        <Text style={s.name}>{user?.name}</Text>
        <View style={s.stats}>
          <Stat label="Today" value={today.length} color={C.mint} />
          <Stat label="Pending" value={pending.length} color={C.amber} />
          <Stat label="Total" value={appts.length} color={C.blue} />
          <Stat label="Rx Today" value={0} color={C.rose} />
        </View>
        <Text style={s.section}>Today's Schedule</Text>
        {today.length === 0 && <Text style={s.empty}>No appointments today.</Text>}
        {today.map(a => (
          <View key={a._id} style={s.appt}>
            <Text style={s.time}>{a.timeSlot?.start}</Text>
            <View style={s.divider} />
            <View style={{ flex:1 }}>
              <Text style={s.patName}>{a.patientId?.name}</Text>
              <Text style={s.meta}>{a.visitType}</Text>
            </View>
            <View style={[s.chip, { backgroundColor: a.status === 'confirmed' ? C.mintDim : 'rgba(245,158,11,0.13)' }]}>
              <Text style={{ fontSize:10, fontWeight:'700', color: a.status === 'confirmed' ? C.mint : C.amber }}>{a.status}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex:1, backgroundColor:C.bg },
  container: { flex:1, padding:20 },
  greeting: { fontSize:14, color:C.text2, marginBottom:4 },
  name: { fontSize:24, fontWeight:'700', color:C.text, marginBottom:20 },
  stats: { flexDirection:'row', gap:10, marginBottom:24 },
  stat: { flex:1, backgroundColor:C.card, borderRadius:10, padding:14, borderTopWidth:2 },
  statLabel: { fontSize:10, textTransform:'uppercase', letterSpacing:0.6, color:C.text2, fontWeight:'600' },
  statValue: { fontSize:28, fontWeight:'700', marginTop:4 },
  section: { fontSize:11, fontWeight:'600', textTransform:'uppercase', letterSpacing:0.8, color:C.text2, marginBottom:12 },
  empty: { fontSize:13, color:C.text3 },
  appt: { flexDirection:'row', alignItems:'center', gap:10, padding:12, backgroundColor:C.bg3, borderRadius:8, borderWidth:1, borderColor:C.border, marginBottom:8 },
  time: { fontSize:12, color:C.mint, fontWeight:'600', minWidth:44 },
  divider: { width:1, height:28, backgroundColor:C.border },
  patName: { fontSize:13, fontWeight:'500', color:C.text },
  meta: { fontSize:11, color:C.text2, marginTop:2 },
  chip: { paddingHorizontal:8, paddingVertical:3, borderRadius:12 },
});
