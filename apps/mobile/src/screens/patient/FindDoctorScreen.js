import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import C from '../../constants/colors';

const SPECS = ['All','Cardiology','Pediatrics','Neurology','Orthopedics'];
const DOCTORS = [
  { id:'d1', name:'Dr. Sarah Al-Amin', specialty:'Cardiologist', rating:4.9, reviews:128, distance:1.2, available:true },
  { id:'d2', name:'Dr. Mahmoud Karimi', specialty:'Neurologist', rating:4.6, reviews:84, distance:3.7, available:false, next:'Thu' },
  { id:'d3', name:'Dr. Rania Al-Jaber', specialty:'Pediatrician', rating:4.8, reviews:201, distance:2.1, available:true },
  { id:'d4', name:'Dr. Yaw Boateng', specialty:'Orthopedic Surgeon', rating:4.4, reviews:57, distance:5.3, available:false, next:'Mon' },
];

const GRADS = ['#0fe3b0','#f59e0b','#8b5cf6','#10b981'];

export default function FindDoctorScreen() {
  const [search, setSearch] = useState('');
  const [spec, setSpec] = useState('All');

  const filtered = DOCTORS.filter(d =>
    (spec === 'All' || d.specialty.toLowerCase().includes(spec.toLowerCase())) &&
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}><Text style={s.title}>Find a Doctor</Text><Text style={s.sub}>47 doctors nearby</Text></View>
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
      <FlatList
        data={filtered} keyExtractor={d => d.id} contentContainerStyle={{ padding:16, paddingTop:0 }}
        renderItem={({ item:d, index:i }) => (
          <View style={s.card}>
            <View style={[s.avatar, { backgroundColor: GRADS[i % GRADS.length] }]}>
              <Text style={s.avatarTxt}>{d.name.split(' ').slice(1,3).map(w=>w[0]).join('')}</Text>
            </View>
            <View style={{ flex:1 }}>
              <Text style={s.docName}>{d.name}</Text>
              <Text style={s.specialty}>{d.specialty}</Text>
              <Text style={s.meta}>{'★'.repeat(Math.floor(d.rating))} {d.rating} · 📍 {d.distance}km</Text>
            </View>
            <View style={{ alignItems:'flex-end', gap:8 }}>
              {d.available
                ? <View style={s.avail}><Text style={s.availTxt}>● Today</Text></View>
                : <Text style={{ fontSize:11, color:C.text3 }}>Next: {d.next}</Text>}
              <TouchableOpacity style={s.bookBtn}><Text style={s.bookTxt}>Book</Text></TouchableOpacity>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex:1, backgroundColor:C.bg },
  header: { padding:20, borderBottomWidth:1, borderBottomColor:C.border },
  title: { fontSize:22, fontWeight:'700', color:C.text },
  sub: { fontSize:12, color:C.text2, marginTop:2 },
  searchBox: { flexDirection:'row', alignItems:'center', margin:16, backgroundColor:C.bg2, borderRadius:10, borderWidth:1, borderColor:C.border, paddingHorizontal:12 },
  searchInput: { flex:1, padding:11, color:C.text, fontSize:14 },
  chip: { paddingHorizontal:14, paddingVertical:6, borderRadius:20, borderWidth:1, borderColor:C.border2, marginRight:8 },
  chipActive: { borderColor:C.mint, backgroundColor:C.mintDim },
  chipTxt: { fontSize:12, color:C.text2, fontWeight:'500' },
  chipTxtActive: { color:C.mint },
  card: { flexDirection:'row', alignItems:'center', gap:12, padding:16, backgroundColor:C.card, borderRadius:10, borderWidth:1, borderColor:C.border, marginBottom:12 },
  avatar: { width:48, height:48, borderRadius:12, alignItems:'center', justifyContent:'center' },
  avatarTxt: { fontSize:16, fontWeight:'800', color:'#fff' },
  docName: { fontSize:14, fontWeight:'600', color:C.text },
  specialty: { fontSize:12, color:C.mint, marginVertical:2 },
  meta: { fontSize:11, color:C.text2 },
  avail: { backgroundColor:C.mintDim, paddingHorizontal:8, paddingVertical:3, borderRadius:10 },
  availTxt: { fontSize:10, color:C.mint, fontWeight:'600' },
  bookBtn: { backgroundColor:C.mint, paddingHorizontal:14, paddingVertical:7, borderRadius:8 },
  bookTxt: { fontSize:12, fontWeight:'700', color:'#000' },
});
