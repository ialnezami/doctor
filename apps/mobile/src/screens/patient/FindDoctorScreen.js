import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDoctors } from '../../api/doctors';
import C from '../../constants/colors';

const SPECS = ['All','Cardiology','Pediatrics','Neurology','Orthopedics','General'];

export default function FindDoctorScreen({ navigation }) {
  const [search, setSearch] = useState('');
  const [spec, setSpec] = useState('All');
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchDrs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.name = search;
      if (spec !== 'All') params.specialty = spec;
      const data = await getDoctors(params);
      setDoctors(data);
    } catch { setDoctors([]); }
    finally { setLoading(false); }
  }, [search, spec]);

  useEffect(() => { const t = setTimeout(fetchDrs, 350); return () => clearTimeout(t); }, [fetchDrs]);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}><Text style={s.title}>Find a Doctor</Text><Text style={s.sub}>{loading ? 'Searching…' : `${doctors.length} results`}</Text></View>
      <View style={s.searchBox}>
        <Text style={{ fontSize:16, color:C.text3 }}>⌕</Text>
        <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search name or specialty…" placeholderTextColor={C.text3} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal:16, marginBottom:12 }}>
        {SPECS.map(sp => (
          <TouchableOpacity key={sp} style={[s.chip, spec===sp && s.chipActive]} onPress={() => setSpec(sp)}>
            <Text style={[s.chipTxt, spec===sp && s.chipTxtActive]}>{sp}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {loading && <ActivityIndicator color={C.mint} style={{ margin:16 }} />}
      <FlatList
        data={doctors} keyExtractor={d => d._id} contentContainerStyle={{ padding:16, paddingTop:0 }}
        renderItem={({ item:d, index:i }) => {
          const name = d.userId?.name || 'Doctor';
          const initials = name.split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('');
          return (
            <View style={s.card}>
              <View style={[s.avatar, { backgroundColor: ['#0fe3b0','#f59e0b','#8b5cf6','#10b981'][i%4] }]}>
                <Text style={s.avatarTxt}>{initials}</Text>
              </View>
              <View style={{ flex:1 }}>
                <Text style={s.docName}>{name}</Text>
                <Text style={s.specialty}>{d.specialty}</Text>
                {d.consultationFee > 0 && <Text style={s.meta}>{d.consultationFee} SAR</Text>}
              </View>
              <TouchableOpacity style={s.bookBtn} onPress={() => navigation.navigate('DoctorProfile', {
                  doctorId: d._id,
                  doctorUserId: d.userId?._id || d.userId,
                })}>
                <Text style={s.bookTxt}>View</Text>
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex:1, backgroundColor:C.bg },
  header: { padding:16, paddingBottom:8 },
  title: { fontSize:22, fontWeight:'700', color:C.text },
  sub: { fontSize:12, color:C.text2, marginTop:2 },
  searchBox: { flexDirection:'row', alignItems:'center', margin:16, marginTop:8, backgroundColor:C.bg2, borderRadius:10, borderWidth:1, borderColor:C.border, paddingHorizontal:12 },
  searchInput: { flex:1, padding:10, color:C.text, fontSize:13 },
  chip: { paddingHorizontal:14, paddingVertical:6, borderRadius:20, borderWidth:1, borderColor:C.border2, marginRight:8, backgroundColor:'transparent' },
  chipActive: { borderColor:C.mint, backgroundColor:C.bg3 },
  chipTxt: { fontSize:12, color:C.text2 },
  chipTxtActive: { color:C.mint, fontWeight:'600' },
  card: { flexDirection:'row', alignItems:'center', gap:12, padding:14, backgroundColor:C.card, borderRadius:12, borderWidth:1, borderColor:C.border, marginBottom:10 },
  avatar: { width:44, height:44, borderRadius:10, justifyContent:'center', alignItems:'center' },
  avatarTxt: { fontSize:14, fontWeight:'700', color:'#fff' },
  docName: { fontSize:14, fontWeight:'600', color:C.text },
  specialty: { fontSize:12, color:C.mint, marginTop:2 },
  meta: { fontSize:11, color:C.text3, marginTop:2 },
  bookBtn: { backgroundColor:C.mint, paddingHorizontal:14, paddingVertical:7, borderRadius:8 },
  bookTxt: { fontSize:12, fontWeight:'700', color:'#000' },
});
