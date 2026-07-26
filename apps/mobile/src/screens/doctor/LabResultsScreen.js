import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import C from '../../constants/colors';
import { getLabResults, addLabNotes } from '../../api/labResults';

const FLAG = {
  normal:   { color: C.mint,  label: 'Normal',   bg: 'rgba(15,227,176,0.1)' },
  high:     { color: C.amber, label: 'High',      bg: 'rgba(245,158,11,0.1)' },
  low:      { color: C.amber, label: 'Low',       bg: 'rgba(245,158,11,0.1)' },
  critical: { color: C.rose,  label: 'Critical',  bg: 'rgba(244,63,94,0.12)' },
};

const worstFlag = (tests) => {
  const order = { critical:3, high:2, low:2, normal:0 };
  return tests.reduce((acc, t) => (order[t.flag] > order[acc] ? t.flag : acc), 'normal');
};

export default function DoctorLabResultsScreen() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getLabResults().then(setResults).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const openResult = (r) => { setSelected(r); setNotes(r.notes || ''); };

  const saveNotes = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await addLabNotes(selected._id, notes);
      setSelected(updated);
      setResults(prev => prev.map(r => r._id === updated._id ? updated : r));
    } catch {} finally { setSaving(false); }
  };

  if (selected) {
    const flag = worstFlag(selected.tests);
    const fs = FLAG[flag];
    return (
      <SafeAreaView style={{ flex:1, backgroundColor:C.bg }}>
        <View style={[s.header, { flexDirection:'row', alignItems:'center' }]}>
          <TouchableOpacity onPress={() => setSelected(null)} style={{ marginRight:12 }}>
            <Text style={{ fontSize:22, color:C.mint }}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex:1 }}>
            <Text style={s.title} numberOfLines={1}>{selected.labName}</Text>
            <Text style={s.sub}>{selected.patientId?.name || 'Patient'} · {new Date(selected.issuedAt).toLocaleDateString()}</Text>
          </View>
          <View style={[s.badge, { backgroundColor: fs.bg }]}>
            <Text style={[s.badgeTxt, { color: fs.color }]}>{fs.label}</Text>
          </View>
        </View>

        <ScrollView style={{ padding:16 }} showsVerticalScrollIndicator={false}>
          {selected.tests.map((t, i) => {
            const tf = FLAG[t.flag] || FLAG.normal;
            return (
              <View key={i} style={s.testCard}>
                <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                  <Text style={s.testName}>{t.name}</Text>
                  <View style={[s.miniBadge, { backgroundColor: tf.bg }]}>
                    <Text style={[s.miniBadgeTxt, { color: tf.color }]}>{t.flag}</Text>
                  </View>
                </View>
                <View style={{ flexDirection:'row', alignItems:'baseline', gap:4, marginTop:4 }}>
                  <Text style={[s.testValue, { color: tf.color }]}>{t.value}</Text>
                  <Text style={s.unit}>{t.unit}</Text>
                  {t.referenceRange ? <Text style={s.range}>({t.referenceRange})</Text> : null}
                </View>
              </View>
            );
          })}

          <View style={s.notesSection}>
            <Text style={s.notesLabel}>Clinical Interpretation</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Add your interpretation…"
              placeholderTextColor={C.text3}
              multiline
              style={s.notesInput}
            />
            <TouchableOpacity style={s.saveBtn} onPress={saveNotes} disabled={saving}>
              {saving ? <ActivityIndicator color="#000" size="small" /> : <Text style={s.saveBtnTxt}>Save Notes</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:C.bg }}>
      <View style={s.header}>
        <Text style={s.title}>Lab Results</Text>
        <Text style={s.sub}>Patient laboratory reports</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop:40 }} color={C.mint} />
      ) : results.length === 0 ? (
        <View style={s.empty}><Text style={s.emptyTxt}>🔬{'\n'}No lab results yet</Text></View>
      ) : (
        <ScrollView style={{ padding:16 }} showsVerticalScrollIndicator={false}>
          {results.map(r => {
            const flag = worstFlag(r.tests);
            const fs = FLAG[flag];
            return (
              <TouchableOpacity key={r._id} onPress={() => openResult(r)} style={s.card}>
                <View style={s.cardHeader}>
                  <View style={[s.dot, { backgroundColor: fs.color }]} />
                  <View style={{ flex:1 }}>
                    <Text style={s.labName}>{r.labName}</Text>
                    <Text style={s.patientName}>{r.patientId?.name || 'Patient'}</Text>
                  </View>
                  <View>
                    <View style={[s.badge, { backgroundColor: fs.bg, marginBottom:4 }]}>
                      <Text style={[s.badgeTxt, { color: fs.color }]}>{fs.label}</Text>
                    </View>
                    <Text style={s.dateText}>{new Date(r.issuedAt).toLocaleDateString()}</Text>
                  </View>
                </View>
                <Text style={s.meta}>{r.tests.length} test{r.tests.length !== 1 ? 's' : ''}{r.status === 'ready' ? ' · Ready' : ' · Pending'}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { padding:20, borderBottomWidth:1, borderBottomColor:C.border },
  title: { fontSize:20, fontWeight:'700', color:C.text },
  sub: { fontSize:12, color:C.text2, marginTop:2 },
  empty: { flex:1, alignItems:'center', justifyContent:'center' },
  emptyTxt: { fontSize:14, color:C.text3, textAlign:'center', lineHeight:26 },
  card: { backgroundColor:C.card, borderRadius:10, borderWidth:1, borderColor:C.border, padding:14, marginBottom:10 },
  cardHeader: { flexDirection:'row', alignItems:'flex-start', gap:10, marginBottom:5 },
  dot: { width:8, height:8, borderRadius:4, marginTop:5 },
  labName: { fontSize:14, fontWeight:'600', color:C.text },
  patientName: { fontSize:12, color:C.text2, marginTop:2 },
  badge: { paddingHorizontal:8, paddingVertical:2, borderRadius:10, alignSelf:'flex-start' },
  badgeTxt: { fontSize:10, fontWeight:'700', textTransform:'uppercase' },
  dateText: { fontSize:10.5, color:C.text3, textAlign:'right' },
  meta: { fontSize:11.5, color:C.text3, paddingLeft:18 },
  testCard: { backgroundColor:C.card, borderRadius:8, borderWidth:1, borderColor:C.border, padding:12, marginBottom:8 },
  testName: { flex:1, fontSize:13.5, fontWeight:'500', color:C.text },
  testValue: { fontSize:20, fontWeight:'700' },
  unit: { fontSize:13, color:C.text2 },
  range: { fontSize:11, color:C.text3 },
  miniBadge: { paddingHorizontal:6, paddingVertical:2, borderRadius:8 },
  miniBadgeTxt: { fontSize:9, fontWeight:'700', textTransform:'uppercase' },
  notesSection: { marginTop:10, marginBottom:30 },
  notesLabel: { fontSize:11, fontWeight:'700', textTransform:'uppercase', letterSpacing:0.8, color:C.text2, marginBottom:8 },
  notesInput: { backgroundColor:C.card, borderRadius:10, borderWidth:1, borderColor:C.border, padding:14, color:C.text, fontSize:13.5, minHeight:100, textAlignVertical:'top', marginBottom:12 },
  saveBtn: { backgroundColor:C.mint, borderRadius:10, padding:14, alignItems:'center' },
  saveBtnTxt: { fontSize:14, fontWeight:'700', color:'#000' },
});
