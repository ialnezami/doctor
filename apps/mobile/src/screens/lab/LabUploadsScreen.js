import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import client from '../../api/client';
import { updateLabLocation } from '../../api/map';
import C from '../../constants/colors';

const LAB_MAP_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>* { margin:0; padding:0; } #map { width:100vw; height:100%; }</style>
</head>
<body>
<div id="map"></div>
<script>
var map = L.map('map').setView([24.7136, 46.6753], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors', maxZoom: 18
}).addTo(map);
var marker = L.marker([24.7136, 46.6753], { draggable: true }).addTo(map);
function send(lat, lng) {
  window.ReactNativeWebView.postMessage(JSON.stringify({ event: 'markerDragged', data: { lat: lat, lng: lng } }));
}
marker.on('dragend', function() { var ll = marker.getLatLng(); send(ll.lat, ll.lng); });
map.on('click', function(e) { marker.setLatLng(e.latlng); send(e.latlng.lat, e.latlng.lng); });
function moveTo(lat, lng) { map.setView([lat, lng], 14); marker.setLatLng([lat, lng]); }
</script>
</body>
</html>`;

export default function LabUploadsScreen() {
  const [approved, setApproved]       = useState(null);
  const [uploads, setUploads]         = useState([]);
  const [form, setForm]               = useState({ patientId: '', labName: '', testName: '', result: '' });
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState('');
  const [savedCoords, setSavedCoords] = useState(null);
  const [pendingCoords, setPendingCoords] = useState(null);
  const [locSaving, setLocSaving]     = useState(false);
  const [locMsg, setLocMsg]           = useState('');
  const mapRef = useRef(null);

  useEffect(() => {
    Promise.all([
      client.get('/lab-results/my-uploads'),
      client.get('/labs/me'),
    ])
      .then(([uploadsData, labData]) => {
        setUploads(uploadsData);
        setApproved(true);
        const coords = labData?.location?.coordinates;
        if (coords && (coords[0] !== 0 || coords[1] !== 0)) setSavedCoords(coords);
      })
      .catch(() => setApproved(false));
  }, []);

  const onMapLoad = () => {
    if (savedCoords && mapRef.current) {
      const [lng, lat] = savedCoords;
      mapRef.current.injectJavaScript(`moveTo(${lat}, ${lng}); true;`);
    }
  };

  const onMapMessage = (e) => {
    try {
      const { event, data } = JSON.parse(e.nativeEvent.data);
      if (event === 'markerDragged') { setPendingCoords(data); setLocMsg(''); }
    } catch { /* ignore */ }
  };

  const confirmLocation = async () => {
    if (!pendingCoords) return;
    setLocSaving(true); setLocMsg('');
    try {
      await updateLabLocation(pendingCoords.lat, pendingCoords.lng);
      setSavedCoords([pendingCoords.lng, pendingCoords.lat]);
      setPendingCoords(null);
      setLocMsg('Location saved.');
    } catch { setLocMsg('Failed to save location. Try again.'); }
    finally { setLocSaving(false); }
  };

  const submit = async () => {
    if (!form.patientId || !form.labName || !form.testName) {
      setError('Patient ID, lab name and test name are required'); return;
    }
    setSubmitting(true); setError('');
    try {
      const result = await client.post('/lab-results', {
        patientId: form.patientId, labName: form.labName,
        tests: [{ name: form.testName, value: form.result, flag: 'normal' }], status: 'ready',
      });
      setUploads(u => [result, ...u]);
      setForm({ patientId: '', labName: '', testName: '', result: '' });
    } catch (e) { setError(e.message || 'Upload failed'); }
    finally { setSubmitting(false); }
  };

  if (approved === null) return <View style={s.center}><ActivityIndicator color={C.mint} /></View>;

  if (!approved) return (
    <SafeAreaView style={s.safe}>
      <View style={s.center}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>⏳</Text>
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
          <View style={{ padding: 20 }}>
            <Text style={s.heading}>Upload Result</Text>
            <View style={s.card}>
              {[['patientId', 'Patient ID'], ['labName', 'Lab Name'], ['testName', 'Test Name'], ['result', 'Result Value']].map(([k, l]) => (
                <View key={k} style={{ marginBottom: 12 }}>
                  <Text style={s.label}>{l}</Text>
                  <TextInput style={s.input} value={form[k]} onChangeText={v => setForm(f => ({ ...f, [k]: v }))} placeholderTextColor={C.text3} />
                </View>
              ))}
              {!!error && <Text style={{ color: C.rose, fontSize: 12, marginBottom: 8 }}>{error}</Text>}
              <TouchableOpacity style={[s.btn, submitting && { opacity: 0.6 }]} onPress={submit} disabled={submitting}>
                <Text style={s.btnTxt}>{submitting ? 'Uploading…' : 'Upload'}</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.sectionLabel}>Clinic Location</Text>
            <Text style={{ fontSize: 12, color: C.text3, marginBottom: 10 }}>Tap or drag the pin to set your clinic location.</Text>
            <View style={s.mapCard}>
              <WebView ref={mapRef} source={{ html: LAB_MAP_HTML }} style={s.mapView} javaScriptEnabled originWhitelist={['*']} onMessage={onMapMessage} onLoad={onMapLoad} geolocationEnabled={false} />
            </View>
            {!!locMsg && <Text style={[s.locMsg, locMsg.includes('Failed') ? { color: C.rose } : { color: C.mint }]}>{locMsg}</Text>}
            <TouchableOpacity style={[s.btn, (!pendingCoords || locSaving) && { opacity: 0.5 }]} onPress={confirmLocation} disabled={!pendingCoords || locSaving}>
              <Text style={s.btnTxt}>{locSaving ? 'Saving…' : 'Confirm Location'}</Text>
            </TouchableOpacity>

            <Text style={[s.sectionLabel, { marginTop: 24 }]}>My Uploads</Text>
            {uploads.length === 0 && <Text style={{ fontSize: 12, color: C.text3 }}>No uploads yet.</Text>}
          </View>
        }
        renderItem={({ item: u }) => (
          <View style={s.uploadRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }}>{u.labName}</Text>
              <Text style={{ color: C.text2, fontSize: 12 }}>{u.tests?.[0]?.name}</Text>
            </View>
            <Text style={{ color: C.text3, fontSize: 11 }}>{u.status}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: C.bg },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  heading:      { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 8 },
  body:         { fontSize: 14, color: C.text2, textAlign: 'center', lineHeight: 22 },
  card:         { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 20 },
  label:        { fontSize: 11, color: C.text3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  input:        { backgroundColor: C.bg3, borderRadius: 8, borderWidth: 1, borderColor: C.border2, padding: 10, color: C.text, fontSize: 13 },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: C.text2, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  uploadRow:    { flexDirection: 'row', alignItems: 'center', padding: 14, marginHorizontal: 20, backgroundColor: C.bg2, borderRadius: 10, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
  btn:          { backgroundColor: C.mint, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 4 },
  btnTxt:       { fontSize: 14, fontWeight: '700', color: '#000' },
  mapCard:      { height: 220, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.border, marginBottom: 10 },
  mapView:      { flex: 1 },
  locMsg:       { fontSize: 12, marginTop: 6, marginBottom: 6, textAlign: 'center' },
});
