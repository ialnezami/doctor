import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import C from '../../constants/colors';
import { getAppointments, updateStatus } from '../../api/appointments';

const STATUS_COLOR = { confirmed: C.mint, pending: C.amber, cancelled: C.rose, completed: C.blue };

export default function AppointmentsScreen({ navigation }) {
  const [appts, setAppts] = useState([]);
  const load = () => getAppointments().then(r => setAppts(Array.isArray(r) ? r : r.data || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const handle = async (id, status) => { await updateStatus(id, status); load(); };

  const pending = appts.filter(a => a.status === 'pending');

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}><Text style={s.title}>Appointments</Text></View>
      <FlatList
        data={appts}
        keyExtractor={a => a._id}
        contentContainerStyle={{ padding:16 }}
        ListHeaderComponent={pending.length > 0 ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>PENDING APPROVAL ({pending.length})</Text>
            {pending.map(a => (
              <View key={a._id} style={[s.card, { borderColor:'rgba(245,158,11,0.3)' }]}>
                <View style={{ flex:1 }}>
                  <Text style={s.patName}>{a.patientId?.name}</Text>
                  <Text style={s.meta}>{new Date(a.date).toLocaleDateString()} · {a.reason}</Text>
                </View>
                <TouchableOpacity style={s.acceptBtn} onPress={() => handle(a._id,'confirmed')}>
                  <Text style={s.acceptTxt}>✓</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.declineBtn} onPress={() => handle(a._id,'cancelled')}>
                  <Text style={s.declineTxt}>✗</Text>
                </TouchableOpacity>
              </View>
            ))}
            <Text style={[s.sectionTitle, { marginTop:16 }]}>ALL APPOINTMENTS</Text>
          </View>
        ) : null}
        renderItem={({ item:a }) => (
          <TouchableOpacity style={s.card} onPress={() => navigation?.navigate('AppointmentDetail', { appointmentId: a._id })}>
            <Text style={[s.time, { color: STATUS_COLOR[a.status] || C.mint }]}>{a.timeSlot?.start}</Text>
            <View style={{ flex:1 }}>
              <Text style={s.patName}>{a.patientId?.name}</Text>
              <Text style={s.meta}>{new Date(a.date).toLocaleDateString()} · {a.visitType}</Text>
            </View>
            <View style={[s.chip, { backgroundColor: (STATUS_COLOR[a.status] || C.mint) + '22' }]}>
              <Text style={{ fontSize:10, fontWeight:'700', color: STATUS_COLOR[a.status] || C.mint }}>{a.status}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex:1, backgroundColor:C.bg },
  header: { padding:20, borderBottomWidth:1, borderBottomColor:C.border },
  title: { fontSize:22, fontWeight:'700', color:C.text },
  section: { marginBottom:8 },
  sectionTitle: { fontSize:10, fontWeight:'600', letterSpacing:0.8, color:C.text2, marginBottom:10 },
  card: { flexDirection:'row', alignItems:'center', gap:10, padding:12, backgroundColor:C.bg3, borderRadius:8, borderWidth:1, borderColor:C.border, marginBottom:8 },
  time: { fontSize:12, fontWeight:'600', minWidth:44 },
  patName: { fontSize:13, fontWeight:'500', color:C.text },
  meta: { fontSize:11, color:C.text2, marginTop:2 },
  chip: { paddingHorizontal:8, paddingVertical:3, borderRadius:12 },
  acceptBtn: { backgroundColor:C.mint, borderRadius:6, padding:6 },
  acceptTxt: { fontSize:12, fontWeight:'700', color:'#000' },
  declineBtn: { backgroundColor:'rgba(244,63,94,0.15)', borderRadius:6, padding:6, borderWidth:1, borderColor:'rgba(244,63,94,0.3)' },
  declineTxt: { fontSize:12, fontWeight:'700', color:C.rose },
});
