import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import C from '../../constants/colors';
import { getLabResults, createShareLink } from '../../api/labResults';
import ErrorState from '../../components/ErrorState';

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

function ShareModal({ result, onClose }) {
  const [expiry, setExpiry] = useState('24h');
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await createShareLink({ resourceType: 'lab_result', resourceId: result._id, expiry });
      setLink(res);
    } catch {} finally { setLoading(false); }
  };

  const shareUrl = link ? `http://localhost:3000/s/${link.token}` : null;

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={ms.overlay}>
        <View style={ms.sheet}>
          <View style={ms.handle} />
          <Text style={ms.title}>🔗 Share Lab Result</Text>
          <Text style={ms.sub}>{result.labName}</Text>

          {!link ? (
            <>
              <Text style={ms.label}>Expiry</Text>
              <View style={ms.row}>
                {[['1h','1 hour'],['24h','24h'],['7d','7 days']].map(([v,l]) => (
                  <TouchableOpacity key={v} onPress={() => setExpiry(v)}
                    style={[ms.chip, expiry === v && ms.chipActive]}>
                    <Text style={[ms.chipTxt, expiry === v && { color: C.mint }]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={ms.btn} onPress={generate} disabled={loading}>
                {loading ? <ActivityIndicator color="#000" /> : <Text style={ms.btnTxt}>Generate Link</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={ms.linkBox}>
                <Text style={ms.linkTxt} numberOfLines={2}>{shareUrl}</Text>
              </View>
              <TouchableOpacity style={ms.btn} onPress={() => Linking.openURL(shareUrl)}>
                <Text style={ms.btnTxt}>Open Link</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity onPress={onClose} style={ms.cancelBtn}>
            <Text style={ms.cancelTxt}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function LabResultsScreen() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [shareTarget, setShareTarget] = useState(null);

  useEffect(() => {
    getLabResults().then(setResults).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:C.bg }}>
      <View style={s.header}>
        <Text style={s.title}>Lab Results</Text>
        <Text style={s.sub}>Your laboratory reports</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop:40 }} color={C.mint} />
      ) : results.length === 0 ? (
        <ErrorState icon="🧪" title="No lab results yet" message="Your lab results will appear here once available." />
      ) : (
        <ScrollView style={{ padding:16 }} showsVerticalScrollIndicator={false}>
          {results.map(r => {
            const flag = worstFlag(r.tests);
            const fs = FLAG[flag];
            const isOpen = selected?._id === r._id;
            return (
              <TouchableOpacity key={r._id} onPress={() => setSelected(isOpen ? null : r)}
                style={[s.card, isOpen && { borderColor: C.mint }]}>
                <View style={s.cardHeader}>
                  <View style={[s.dot, { backgroundColor: fs.color }]} />
                  <Text style={s.labName}>{r.labName}</Text>
                  <View style={[s.badge, { backgroundColor: fs.bg }]}>
                    <Text style={[s.badgeTxt, { color: fs.color }]}>{fs.label}</Text>
                  </View>
                </View>
                <Text style={s.meta}>{r.tests.length} test{r.tests.length !== 1 ? 's' : ''} · {new Date(r.issuedAt).toLocaleDateString()}</Text>

                {isOpen && (
                  <View style={s.detail}>
                    <View style={s.divider} />
                    {r.tests.map((t, i) => {
                      const tf = FLAG[t.flag] || FLAG.normal;
                      return (
                        <View key={i} style={s.testRow}>
                          <Text style={s.testName}>{t.name}</Text>
                          <Text style={[s.testValue, { color: tf.color }]}>{t.value} {t.unit}</Text>
                          <View style={[s.miniBadge, { backgroundColor: tf.bg }]}>
                            <Text style={[s.miniBadgeTxt, { color: tf.color }]}>{t.flag}</Text>
                          </View>
                        </View>
                      );
                    })}
                    {r.notes ? (
                      <View style={s.notesBox}>
                        <Text style={s.notesLabel}>Doctor's Notes</Text>
                        <Text style={s.notesTxt}>{r.notes}</Text>
                      </View>
                    ) : null}
                    <View style={{ flexDirection:'row', gap:8, marginTop:12 }}>
                      <TouchableOpacity style={s.actionBtn} onPress={() => setShareTarget(r)}>
                        <Text style={s.actionTxt}>🔗 Share</Text>
                      </TouchableOpacity>
                      {r.reportFile && (
                        <TouchableOpacity style={s.actionBtn} onPress={() => Linking.openURL(r.reportFile)}>
                          <Text style={s.actionTxt}>↓ PDF</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {shareTarget && <ShareModal result={shareTarget} onClose={() => setShareTarget(null)} />}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { padding:20, borderBottomWidth:1, borderBottomColor:C.border },
  title: { fontSize:22, fontWeight:'700', color:C.text },
  sub: { fontSize:12, color:C.text2, marginTop:2 },
  empty: { flex:1, alignItems:'center', justifyContent:'center' },
  emptyTxt: { fontSize:14, color:C.text3, textAlign:'center', lineHeight:26 },
  card: { backgroundColor:C.card, borderRadius:10, borderWidth:1, borderColor:C.border, padding:14, marginBottom:10 },
  cardHeader: { flexDirection:'row', alignItems:'center', gap:8, marginBottom:4 },
  dot: { width:8, height:8, borderRadius:4 },
  labName: { flex:1, fontSize:14, fontWeight:'600', color:C.text },
  badge: { paddingHorizontal:8, paddingVertical:2, borderRadius:10 },
  badgeTxt: { fontSize:10, fontWeight:'700', textTransform:'uppercase' },
  meta: { fontSize:11.5, color:C.text3, paddingLeft:16 },
  detail: { marginTop:10 },
  divider: { height:1, backgroundColor:C.border, marginBottom:10 },
  testRow: { flexDirection:'row', alignItems:'center', gap:6, marginBottom:7 },
  testName: { flex:1, fontSize:12.5, color:C.text2 },
  testValue: { fontSize:12.5, fontFamily:'monospace', fontWeight:'600' },
  miniBadge: { paddingHorizontal:6, paddingVertical:1, borderRadius:8 },
  miniBadgeTxt: { fontSize:9, fontWeight:'700', textTransform:'uppercase' },
  notesBox: { backgroundColor:C.bg3, borderRadius:8, padding:10, marginTop:8 },
  notesLabel: { fontSize:10, fontWeight:'700', textTransform:'uppercase', color:C.mint, marginBottom:4 },
  notesTxt: { fontSize:12.5, color:C.text2, lineHeight:18 },
  actionBtn: { paddingHorizontal:14, paddingVertical:7, borderRadius:8, borderWidth:1, borderColor:C.border2 },
  actionTxt: { fontSize:12.5, color:C.text2 },
});

const ms = StyleSheet.create({
  overlay: { flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'flex-end' },
  sheet: { backgroundColor:C.bg2, borderTopLeftRadius:20, borderTopRightRadius:20, padding:24, paddingBottom:36 },
  handle: { width:36, height:4, backgroundColor:C.border2, borderRadius:2, alignSelf:'center', marginBottom:20 },
  title: { fontSize:17, fontWeight:'700', color:C.text, marginBottom:4 },
  sub: { fontSize:12, color:C.text2, marginBottom:20 },
  label: { fontSize:11, fontWeight:'600', textTransform:'uppercase', letterSpacing:0.8, color:C.text3, marginBottom:8 },
  row: { flexDirection:'row', gap:8, marginBottom:20 },
  chip: { paddingHorizontal:14, paddingVertical:7, borderRadius:8, borderWidth:1, borderColor:C.border2 },
  chipActive: { borderColor:C.mint, backgroundColor:'rgba(15,227,176,0.1)' },
  chipTxt: { fontSize:12.5, color:C.text2 },
  btn: { backgroundColor:C.mint, borderRadius:10, padding:14, alignItems:'center', marginBottom:10 },
  btnTxt: { fontSize:14, fontWeight:'700', color:'#000' },
  cancelBtn: { padding:12, alignItems:'center' },
  cancelTxt: { fontSize:13.5, color:C.text3 },
  linkBox: { backgroundColor:C.bg3, borderRadius:8, padding:12, marginBottom:14 },
  linkTxt: { fontFamily:'monospace', fontSize:12, color:C.mint },
});
