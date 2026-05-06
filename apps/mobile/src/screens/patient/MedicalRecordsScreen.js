import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import C from '../../constants/colors';

const MOCK_RX = [
  { id:'rx1', doctor:'Dr. Mahmoud Karimi', meds:'Topiramate 50mg', date:'20 Apr 2026' },
  { id:'rx2', doctor:'Dr. Rania Al-Jaber', meds:'Amoxicillin 500mg', date:'02 Mar 2026' },
];

export default function MedicalRecordsScreen() {
  return (
    <SafeAreaView style={{ flex:1, backgroundColor:C.bg }}>
      <View style={s.header}><Text style={s.title}>Medical Records</Text></View>
      <ScrollView style={{ padding:16 }}>
        <View style={s.profileCard}>
          <Text style={s.section}>HEALTH PROFILE</Text>
          <View style={s.vitals}>
            {[['Age','27','years'],['Blood Type','A+',''],['Allergies','2','recorded']].map(([l,v,u]) => (
              <View key={l} style={s.vital}>
                <Text style={s.vLabel}>{l}</Text>
                <Text style={s.vValue}>{v}</Text>
                <Text style={s.vUnit}>{u}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection:'row', gap:8, marginTop:14, flexWrap:'wrap' }}>
            {['Migraine','Anxiety'].map(c => <View key={c} style={s.tag}><Text style={s.tagTxt}>{c}</Text></View>)}
            <View style={[s.tag, { backgroundColor:'rgba(244,63,94,0.13)', borderColor:'rgba(244,63,94,0.3)' }]}>
              <Text style={[s.tagTxt, { color:C.rose }]}>Penicillin allergy</Text>
            </View>
          </View>
        </View>

        <Text style={s.section}>PRESCRIPTIONS</Text>
        {MOCK_RX.map(rx => (
          <View key={rx.id} style={s.rxCard}>
            <Text style={s.rxId}>RX</Text>
            <View style={{ flex:1 }}>
              <Text style={s.rxDoc}>{rx.doctor}</Text>
              <Text style={s.rxMeds}>{rx.meds} · {rx.date}</Text>
            </View>
            <Text style={s.pdfBtn}>↓ PDF</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { padding:20, borderBottomWidth:1, borderBottomColor:C.border },
  title: { fontSize:22, fontWeight:'700', color:C.text },
  section: { fontSize:10, fontWeight:'600', letterSpacing:0.8, color:C.text2, marginBottom:12 },
  profileCard: { backgroundColor:C.card, borderRadius:10, borderWidth:1, borderColor:C.border, padding:16, marginBottom:20 },
  vitals: { flexDirection:'row', gap:10 },
  vital: { flex:1, backgroundColor:C.bg3, borderRadius:8, borderWidth:1, borderColor:C.border, padding:10, alignItems:'center' },
  vLabel: { fontSize:10, textTransform:'uppercase', color:C.text3 },
  vValue: { fontSize:20, fontWeight:'700', color:C.text, marginVertical:2 },
  vUnit: { fontSize:10, color:C.text2 },
  tag: { paddingHorizontal:10, paddingVertical:4, borderRadius:20, backgroundColor:C.bg3, borderWidth:1, borderColor:C.border2 },
  tagTxt: { fontSize:11, fontWeight:'600', color:C.text2 },
  rxCard: { flexDirection:'row', alignItems:'center', gap:12, padding:12, backgroundColor:C.bg3, borderRadius:8, borderWidth:1, borderColor:C.border, marginBottom:8 },
  rxId: { fontSize:10, fontFamily:'monospace', color:C.mint, minWidth:30 },
  rxDoc: { fontSize:13, fontWeight:'500', color:C.text },
  rxMeds: { fontSize:11, color:C.text2, marginTop:2 },
  pdfBtn: { fontSize:13, color:C.text2 },
});
