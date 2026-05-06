import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import C from '../../constants/colors';
import { getAppointments, updateStatus } from '../../api/appointments';

const STATUS_COLOR = { confirmed:C.mint, pending:C.amber, cancelled:C.rose, completed:C.blue };

export default function MyAppointmentsScreen() {
  const [appts, setAppts] = useState([]);
  const load = () => getAppointments().then(setAppts).catch(() => {});
  useEffect(() => { load(); }, []);

  const cancel = async (id) => { await updateStatus(id,'cancelled'); load(); };
  const upcoming = appts.filter(a => ['pending','confirmed'].includes(a.status));
  const past = appts.filter(a => ['completed','cancelled'].includes(a.status));

  const Item = ({ a, isPast }) => (
    <View style={[s.card, !isPast && { borderColor:'rgba(15,227,176,0.25)' }]}>
      <View style={[s.avatar, { backgroundColor: C.mint }]}><Text style={s.avTxt}>{a.doctorId?.name?.split(' ').slice(1,3).map(w=>w[0]).join('')||'DR'}</Text></View>
      <View style={{ flex:1 }}>
        <Text style={s.docName}>{a.doctorId?.name}</Text>
        <Text style={s.meta}>{new Date(a.date).toLocaleDateString()} · {a.timeSlot?.start}</Text>
      </View>
      <View style={[s.chip, { backgroundColor:(STATUS_COLOR[a.status]||C.mint)+'22' }]}>
        <Text style={{ fontSize:10, fontWeight:'700', color:STATUS_COLOR[a.status]||C.mint }}>{a.status}</Text>
      </View>
      {!isPast && <TouchableOpacity style={s.cancelBtn} onPress={() => cancel(a._id)}><Text style={s.cancelTxt}>Cancel</Text></TouchableOpacity>}
    </View>
  );

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:C.bg }}>
      <View style={s.header}><Text style={s.title}>My Appointments</Text></View>
      <FlatList data={[...upcoming,...past]} keyExtractor={a => a._id} contentContainerStyle={{ padding:16 }}
        ListHeaderComponent={<Text style={s.section}>{upcoming.length > 0 ? 'UPCOMING' : 'NO UPCOMING APPOINTMENTS'}</Text>}
        renderItem={({ item:a }) => <Item a={a} isPast={['completed','cancelled'].includes(a.status)} />}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { padding:20, borderBottomWidth:1, borderBottomColor:C.border },
  title: { fontSize:22, fontWeight:'700', color:C.text },
  section: { fontSize:10, fontWeight:'600', letterSpacing:0.8, color:C.text2, marginBottom:12 },
  card: { flexDirection:'row', alignItems:'center', gap:10, padding:12, backgroundColor:C.bg3, borderRadius:8, borderWidth:1, borderColor:C.border, marginBottom:8 },
  avatar: { width:38, height:38, borderRadius:9, alignItems:'center', justifyContent:'center' },
  avTxt: { fontSize:12, fontWeight:'700', color:'#fff' },
  docName: { fontSize:13, fontWeight:'500', color:C.text },
  meta: { fontSize:11, color:C.text2, marginTop:2 },
  chip: { paddingHorizontal:8, paddingVertical:3, borderRadius:12 },
  cancelBtn: { backgroundColor:'rgba(244,63,94,0.13)', borderRadius:6, padding:6, borderWidth:1, borderColor:'rgba(244,63,94,0.25)' },
  cancelTxt: { fontSize:11, fontWeight:'600', color:C.rose },
});
