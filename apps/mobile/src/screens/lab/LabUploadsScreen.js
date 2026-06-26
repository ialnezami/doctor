import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import client from '../../api/client';
import C from '../../constants/colors';

export default function LabUploadsScreen() {
  const [approved, setApproved] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [form, setForm] = useState({ patientId:'', labName:'', testName:'', result:'' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/lab-results/my-uploads')
      .then(data => { setUploads(data); setApproved(true); })
      .catch(() => { setApproved(false); });
  }, []);

  const submit = async () => {
    if (!form.patientId || !form.labName || !form.testName) {
      setError('Patient ID, lab name and test name are required'); return;
    }
    setSubmitting(true); setError('');
    try {
      const result = await client.post('/lab-results', {
        patientId: form.patientId,
        labName: form.labName,
        tests: [{ name: form.testName, value: form.result, flag: 'normal' }],
        status: 'ready',
      });
      setUploads(u => [result, ...u]);
      setForm({ patientId:'', labName:'', testName:'', result:'' });
    } catch (e) { setError(e.message || 'Upload failed'); }
    finally { setSubmitting(false); }
  };

  if (approved === null) return <View style={s.center}><ActivityIndicator color={C.mint} /></View>;

  if (!approved) return (
    <SafeAreaView style={s.safe}>
      <View style={s.center}>
        <Text style={{ fontSize:48, marginBottom:16 }}>⏳</Text>
        <Text style={s.heading}>Pending Approval</Text>
        <Text style={s.body}>An administrator needs to approve your lab account before you can upload results.</Text>
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.safe}>
      <FlatList
        data={uploads}
        keyExtractor={u => u._id}
        ListHeaderComponent={
          <View style={{ padding:20 }}>
            <Text style={s.heading}>Upload Result</Text>
            <View style={s.card}>
              {[['patientId','Patient ID'],['labName','Lab Name'],['testName','Test Name'],['result','Result Value']].map(([k,l]) => (
                <View key={k} style={{ marginBottom:12 }}>
                  <Text style={s.label}>{l}</Text>
                  <TextInput style={s.input} value={form[k]} onChangeText={v => setForm(f => ({...f,[k]:v}))}
                    placeholder={l} placeholderTextColor={C.text3} autoCapitalize="none" />
                </View>
              ))}
              {!!error && <Text style={{ color:C.rose, fontSize:12, marginBottom:8 }}>{error}</Text>}
              <TouchableOpacity style={[s.btn, submitting && {opacity:0.6}]} onPress={submit} disabled={submitting}>
                <Text style={s.btnTxt}>{submitting ? 'Uploading…' : 'Upload'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.sectionLabel}>My Uploads</Text>
            {uploads.length === 0 && <Text style={{ fontSize:12, color:C.text3 }}>No uploads yet.</Text>}
          </View>
        }
        renderItem={({ item:u }) => (
          <View style={s.uploadRow}>
            <View style={{ flex:1 }}>
              <Text style={{ fontSize:13, fontWeight:'500', color:C.text }}>{u.labName}</Text>
              <Text style={{ fontSize:11.5, color:C.text2, marginTop:2 }}>{u.tests?.map(t=>t.name).join(', ')}</Text>
            </View>
            <Text style={{ fontSize:11, color:C.text3 }}>{new Date(u.createdAt).toLocaleDateString()}</Text>
          </View>
        )}
        contentContainerStyle={{ paddingBottom:32 }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex:1, backgroundColor:C.bg },
  center: { flex:1, justifyContent:'center', alignItems:'center', padding:32 },
  heading: { fontSize:22, fontWeight:'700', color:C.text, marginBottom:8 },
  body: { fontSize:14, color:C.text2, textAlign:'center', lineHeight:22 },
  card: { backgroundColor:C.card, borderRadius:12, borderWidth:1, borderColor:C.border, padding:16, marginBottom:20 },
  label: { fontSize:11, color:C.text3, marginBottom:4, textTransform:'uppercase', letterSpacing:0.4 },
  input: { backgroundColor:C.bg3, borderRadius:8, borderWidth:1, borderColor:C.border2, padding:10, color:C.text, fontSize:13 },
  sectionLabel: { fontSize:11, fontWeight:'600', color:C.text2, textTransform:'uppercase', letterSpacing:0.5, marginBottom:8 },
  uploadRow: { flexDirection:'row', alignItems:'center', padding:14, marginHorizontal:20, backgroundColor:C.bg2, borderRadius:10, borderWidth:1, borderColor:C.border, marginBottom:8 },
  btn: { backgroundColor:C.mint, borderRadius:10, padding:12, alignItems:'center', marginTop:4 },
  btnTxt: { fontSize:14, fontWeight:'700', color:'#000' },
});
