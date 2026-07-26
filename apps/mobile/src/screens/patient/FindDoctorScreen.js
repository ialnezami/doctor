import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  ScrollView, StyleSheet, ActivityIndicator, Animated, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useTranslation } from 'react-i18next';
import { getDoctors } from '../../api/doctors';
import { getNearbyMapPins } from '../../api/map';
import ErrorState from '../../components/ErrorState';
import C from '../../constants/colors';
import * as Location from 'expo-location';

const SPECIALTIES = [
  { key: 'All',                en: 'All' },
  { key: 'general',            en: 'General Medicine' },
  { key: 'dentistry',          en: 'Dentistry' },
  { key: 'ophthalmology',      en: 'Ophthalmology' },
  { key: 'pediatrics',         en: 'Pediatrics' },
  { key: 'obstetrics',         en: 'OB/GYN' },
  { key: 'internal_medicine',  en: 'Internal Medicine' },
  { key: 'ent',                en: 'ENT' },
  { key: 'cardiology',         en: 'Cardiology' },
  { key: 'orthopedics',        en: 'Orthopedics' },
  { key: 'general_surgery',    en: 'General Surgery' },
  { key: 'psychiatry',         en: 'Psychiatry' },
  { key: 'dermatology',        en: 'Dermatology' },
  { key: 'aesthetics',         en: 'Aesthetics' },
  { key: 'neurology',          en: 'Neurology' },
  { key: 'vascular',           en: 'Vascular' },
  { key: 'oncology',           en: 'Oncology' },
  { key: 'nutrition',          en: 'Nutrition' },
  { key: 'endocrinology',      en: 'Endocrinology & Diabetes' },
  { key: 'urology',            en: 'Urology' },
  { key: 'gastroenterology',   en: 'Gastroenterology' },
  { key: 'physical_therapy',   en: 'Physical Therapy' },
  { key: 'thoracic_surgery',   en: 'Thoracic Surgery' },
  { key: 'neurosurgery',       en: 'Neurosurgery' },
  { key: 'orthopedic_surgery', en: 'Orthopedic Surgery' },
  { key: 'vascular_surgery',   en: 'Vascular Surgery' },
];
const AVATAR_COLORS = ['#0fe3b0', '#f59e0b', '#8b5cf6', '#10b981', '#60a5fa', '#f43f5e'];
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = 220;

const LEAFLET_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>* { margin:0; padding:0; box-sizing:border-box; } #map { width:100vw; height:100vh; }</style>
</head>
<body>
<div id="map"></div>
<script>
var map = L.map('map', { zoomControl: true });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors', maxZoom: 18
}).addTo(map);
var markers = [];
function send(event, data) {
  window.ReactNativeWebView.postMessage(JSON.stringify({ event: event, data: data }));
}
function clearMarkers() {
  markers.forEach(function(m) { map.removeLayer(m); });
  markers = [];
}
function updateMarkers(payload) {
  clearMarkers();
  (payload.doctors || []).forEach(function(d) {
    var c = d.coordinates;
    if (!c || (c[0] === 0 && c[1] === 0)) return;
    var m = L.circleMarker([c[1], c[0]], { radius: 10, color: '#0fe3b0', fillColor: '#0fe3b0', fillOpacity: 0.85, weight: 2 }).addTo(map);
    m.on('click', function() { send('markerTap', d); });
    markers.push(m);
  });
  (payload.labs || []).forEach(function(l) {
    var c = l.coordinates;
    if (!c || (c[0] === 0 && c[1] === 0)) return;
    var m = L.circleMarker([c[1], c[0]], { radius: 10, color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.85, weight: 2 }).addTo(map);
    m.on('click', function() { send('markerTap', l); });
    markers.push(m);
  });
}
map.on('moveend', function() {
  var b = map.getBounds();
  send('regionChanged', { swLat: b.getSouth(), swLng: b.getWest(), neLat: b.getNorth(), neLng: b.getEast() });
});
navigator.geolocation.getCurrentPosition(
  function(pos) { map.setView([pos.coords.latitude, pos.coords.longitude], 13); },
  function()    { map.setView([24.7136, 46.6753], 12); }
);
</script>
</body>
</html>`;

export default function FindDoctorScreen({ navigation }) {
  const { t } = useTranslation();
  const [search, setSearch]       = useState('');
  const [spec, setSpec]           = useState('All');
  const [doctors, setDoctors]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [viewMode, setViewMode]   = useState('list');
  const [selectedPin, setSelectedPin] = useState(null);
  const webViewRef     = useRef(null);
  const regionDebounce = useRef(null);
  const sheetAnim      = useRef(new Animated.Value(SHEET_HEIGHT)).current;

  const [city, setCity]             = useState('');
  const [geoCoords, setGeoCoords]   = useState(null);   // { lat, lng } | null
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError]     = useState('');

  const fetchDrs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search)         params.name      = search;
      if (spec !== 'All') params.specialty = SPECIALTIES.find(s => s.key === spec)?.en || spec;
      if (city.trim())    params.city      = city.trim();
      if (geoCoords) {
        params.lat    = geoCoords.lat;
        params.lng    = geoCoords.lng;
        params.radius = 10000;
      }
      const data = await getDoctors(params);
      setDoctors(data);
    } catch { setDoctors([]); }
    finally { setLoading(false); }
  }, [search, spec, city, geoCoords]);

  useEffect(() => {
    if (viewMode !== 'list') return;
    const tid = setTimeout(fetchDrs, 350);
    return () => clearTimeout(tid);
  }, [fetchDrs, viewMode]);

  const handleNearMe = async () => {
    setGeoLoading(true);
    setCity('');
    setGeoError('');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGeoError('Location permission denied');
        return;
      }
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
      ]);
      setGeoCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      setGeoError('Location unavailable');
    } finally {
      setGeoLoading(false);
    }
  };

  const fetchMapPins = useCallback(async (bbox) => {
    try {
      const result = await getNearbyMapPins({ ...bbox, specialty: spec !== 'All' ? SPECIALTIES.find(s => s.key === spec)?.en || spec : '' });
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`updateMarkers(${JSON.stringify(result)}); true;`);
      }
    } catch { /* silent */ }
  }, [spec]);

  const openSheet = useCallback((pin) => {
    setSelectedPin(pin);
    Animated.timing(sheetAnim, { toValue: 0, duration: 280, useNativeDriver: true }).start();
  }, [sheetAnim]);

  const closeSheet = useCallback(() => {
    Animated.timing(sheetAnim, { toValue: SHEET_HEIGHT, duration: 220, useNativeDriver: true }).start(() => setSelectedPin(null));
  }, [sheetAnim]);

  const onMessage = useCallback((e) => {
    try {
      const { event, data } = JSON.parse(e.nativeEvent.data);
      if (event === 'regionChanged') {
        clearTimeout(regionDebounce.current);
        regionDebounce.current = setTimeout(() => fetchMapPins(data), 600);
      } else if (event === 'markerTap') {
        openSheet(data);
      }
    } catch { /* ignore */ }
  }, [fetchMapPins, openSheet]);

  useEffect(() => {
    if (viewMode !== 'map' && selectedPin) closeSheet();
  }, [viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const resultLabel = loading
    ? t('findDoctor.searching')
    : t('findDoctor.result', { count: doctors.length });

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.title}>{t('findDoctor.title')}</Text>
        <View style={s.headerRow}>
          {viewMode === 'list' && <Text style={s.sub}>{resultLabel}</Text>}
          <TouchableOpacity style={s.toggleBtn} onPress={() => setViewMode(v => v === 'list' ? 'map' : 'list')} activeOpacity={0.7}>
            <Text style={s.toggleTxt}>{viewMode === 'list' ? '🗺' : '☰'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow} contentContainerStyle={s.chipContent}>
        {SPECIALTIES.map(sp => (
          <TouchableOpacity key={sp.key} style={[s.chip, spec === sp.key && s.chipActive]} onPress={() => setSpec(sp.key)} activeOpacity={0.7}>
            <Text style={[s.chipTxt, spec === sp.key && s.chipTxtActive]}>{t(`findDoctor.specialties.${sp.key}`, sp.en)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {viewMode === 'list' && (
        <>
          <View style={s.searchBox}>
            <Text style={s.searchIcon}>⌕</Text>
            <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder={t('findDoctor.searchPlaceholder')} placeholderTextColor={C.text3} returnKeyType="search" clearButtonMode="while-editing" />
          </View>
          <View style={s.cityRow}>
            <View style={s.cityBox}>
              <Text style={s.cityIcon}>⊕</Text>
              <TextInput
                style={s.cityInput}
                value={city}
                onChangeText={v => { setCity(v); setGeoCoords(null); setGeoError(''); }}
                placeholder="Filter by city…"
                placeholderTextColor={C.text3}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
              {geoCoords && (
                <TouchableOpacity style={s.nearChip} onPress={() => setGeoCoords(null)} activeOpacity={0.7}>
                  <Text style={s.nearChipTxt}>Near you ×</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity style={s.nearBtn} onPress={handleNearMe} disabled={geoLoading} activeOpacity={0.7}>
              {geoLoading
                ? <ActivityIndicator size="small" color={C.mint} />
                : <Text style={s.nearBtnTxt}>📍</Text>
              }
            </TouchableOpacity>
          </View>
          {!!geoError && <Text style={s.geoErr}>{geoError}</Text>}
        </>
      )}

      {viewMode === 'list' ? (
        loading ? <ActivityIndicator color={C.mint} style={s.spinner} /> : (
          <FlatList
            data={doctors}
            keyExtractor={d => d._id}
            contentContainerStyle={s.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<ErrorState icon="🔍" title={t('findDoctor.noResults')} message={t('findDoctor.noResultsHint')} />}
            renderItem={({ item: d, index: i }) => {
              const name     = d.userId?.name || 'Doctor';
              const initials = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('');
              const avatarBg = AVATAR_COLORS[i % AVATAR_COLORS.length];
              const hasSlots = d.availabilitySlots?.length > 0;
              return (
                <TouchableOpacity style={s.card} activeOpacity={0.75} onPress={() => navigation.navigate('DoctorProfile', { doctorId: d._id, doctorUserId: d.userId?._id || d.userId })}>
                  <View style={[s.avatar, { backgroundColor: avatarBg }]}><Text style={s.avatarTxt}>{initials}</Text></View>
                  <View style={s.cardBody}>
                    <Text style={s.docName} numberOfLines={1}>{name}</Text>
                    <Text style={s.specialty} numberOfLines={1}>{d.specialty}</Text>
                    <View style={s.cardMeta}>
                      {hasSlots && <View style={s.availBadge}><View style={s.availDot} /><Text style={s.availTxt}>{t('findDoctor.available')}</Text></View>}
                      {d.consultationFee > 0 && <Text style={s.fee}>{d.consultationFee} {d.currency || 'SAR'}</Text>}
                    </View>
                  </View>
                  <Text style={s.chevron}>›</Text>
                </TouchableOpacity>
              );
            }}
          />
        )
      ) : (
        <View style={s.mapContainer}>
          <WebView ref={webViewRef} source={{ html: LEAFLET_HTML }} style={s.webview} javaScriptEnabled originWhitelist={['*']} onMessage={onMessage} geolocationEnabled />
          {selectedPin && (
            <>
              <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={closeSheet} />
              <Animated.View style={[s.sheet, { transform: [{ translateY: sheetAnim }] }]}>
                <View style={s.sheetHandle} />
                {selectedPin.type === 'doctor' ? (
                  <>
                    <Text style={s.sheetName}>{selectedPin.name}</Text>
                    <Text style={s.sheetSub}>{selectedPin.specialty}</Text>
                    {selectedPin.rating > 0 && <Text style={s.sheetRating}>★ {selectedPin.rating.toFixed(1)}  ({selectedPin.reviewCount} reviews)</Text>}
                    <View style={s.sheetBtns}>
                      <TouchableOpacity style={[s.sheetBtn, s.sheetBtnSecondary]} onPress={() => { closeSheet(); navigation.navigate('DoctorProfile', { doctorId: selectedPin._id, doctorUserId: selectedPin._id }); }}>
                        <Text style={s.sheetBtnSecTxt}>View Profile</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.sheetBtn, s.sheetBtnPrimary]} onPress={() => { closeSheet(); navigation.navigate('BookAppointment', { doctorId: selectedPin._id }); }}>
                        <Text style={s.sheetBtnPriTxt}>Book</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={s.sheetName}>{selectedPin.name}</Text>
                    <Text style={s.sheetSub}>{selectedPin.address || 'No address on file'}</Text>
                    <View style={[s.sheetBtns, { justifyContent: 'center' }]}>
                      <TouchableOpacity style={[s.sheetBtn, s.sheetBtnDisabled]} disabled><Text style={s.sheetBtnSecTxt}>Details coming soon</Text></TouchableOpacity>
                    </View>
                  </>
                )}
              </Animated.View>
            </>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: C.bg },
  header:           { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  headerRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  title:            { fontSize: 24, fontWeight: '700', color: C.text },
  sub:              { fontSize: 12, color: C.text3, flex: 1 },
  toggleBtn:        { padding: 6 },
  toggleTxt:        { fontSize: 20 },
  chipRow:          { maxHeight: 44 },
  chipContent:      { paddingHorizontal: 12, gap: 8, alignItems: 'center' },
  chip:             { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg2 },
  chipActive:       { backgroundColor: C.mint, borderColor: C.mint },
  chipTxt:          { fontSize: 13, color: C.text2 },
  chipTxtActive:    { color: '#000', fontWeight: '600' },
  searchBox:        { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 10, backgroundColor: C.bg3, borderRadius: 12, borderWidth: 1, borderColor: C.border2, paddingHorizontal: 12 },
  searchIcon:       { fontSize: 18, color: C.text3, marginRight: 6 },
  searchInput:      { flex: 1, paddingVertical: 10, color: C.text, fontSize: 14 },
  cityRow:          { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 4, gap: 8 },
  cityBox:          { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg3, borderRadius: 12, borderWidth: 1, borderColor: C.border2, paddingHorizontal: 10 },
  cityIcon:         { fontSize: 16, color: C.text3, marginRight: 6 },
  cityInput:        { flex: 1, paddingVertical: 9, color: C.text, fontSize: 14 },
  nearChip:         { backgroundColor: C.mint + '22', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 4 },
  nearChipTxt:      { fontSize: 11, color: C.mint, fontWeight: '600' },
  nearBtn:          { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: C.border2, backgroundColor: C.bg3, justifyContent: 'center', alignItems: 'center' },
  nearBtnTxt:       { fontSize: 18 },
  geoErr:           { fontSize: 11, color: '#f87171', marginHorizontal: 16, marginBottom: 6 },
  spinner:          { marginTop: 40 },
  list:             { padding: 16, gap: 10 },
  card:             { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14 },
  avatar:           { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarTxt:        { color: '#000', fontWeight: '700', fontSize: 15 },
  cardBody:         { flex: 1 },
  docName:          { fontSize: 15, fontWeight: '600', color: C.text, marginBottom: 2 },
  specialty:        { fontSize: 12, color: C.text2, marginBottom: 4 },
  cardMeta:         { flexDirection: 'row', alignItems: 'center', gap: 8 },
  availBadge:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  availDot:         { width: 6, height: 6, borderRadius: 3, backgroundColor: C.mint },
  availTxt:         { fontSize: 11, color: C.mint },
  fee:              { fontSize: 11, color: C.text3 },
  chevron:          { fontSize: 22, color: C.text3, marginLeft: 8 },
  mapContainer:     { flex: 1, position: 'relative' },
  webview:          { flex: 1 },
  backdrop:         { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  sheet:            { position: 'absolute', bottom: 0, left: 0, right: 0, height: SHEET_HEIGHT, backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: C.border, padding: 20, zIndex: 20 },
  sheetHandle:      { width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetName:        { fontSize: 17, fontWeight: '700', color: C.text, marginBottom: 4 },
  sheetSub:         { fontSize: 13, color: C.text2, marginBottom: 8 },
  sheetRating:      { fontSize: 13, color: C.amber, marginBottom: 12 },
  sheetBtns:        { flexDirection: 'row', gap: 10 },
  sheetBtn:         { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  sheetBtnPrimary:  { backgroundColor: C.mint },
  sheetBtnSecondary:{ backgroundColor: C.bg3, borderWidth: 1, borderColor: C.border2 },
  sheetBtnDisabled: { backgroundColor: C.bg3, opacity: 0.5 },
  sheetBtnPriTxt:   { color: '#000', fontWeight: '700', fontSize: 14 },
  sheetBtnSecTxt:   { color: C.text, fontWeight: '600', fontSize: 14 },
});
