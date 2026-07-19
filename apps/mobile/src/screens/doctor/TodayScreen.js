import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getAppointments } from '../../api/appointments';

const TEAL = '#0d9488';

function parseTime(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function groupTodayAppointments(appointments) {
  const now = new Date();
  const today = appointments.filter(a => a.date && isSameDay(new Date(a.date), now));
  const current = today.filter(a => {
    const s = parseTime(a.timeSlot?.start), e = parseTime(a.timeSlot?.end);
    return s && e && s <= now && now <= e;
  });
  const upcoming = today.filter(a => { const s = parseTime(a.timeSlot?.start); return s && s > now; });
  return { current, upcoming };
}

const STATUS_LABEL  = { confirmed: 'مؤكد', scheduled: 'مجدول', attended: 'تم الحضور', completed: 'تم الحضور', cancelled: 'ملغى', pending: 'معلق' };
const STATUS_COLOR  = { confirmed: TEAL, scheduled: '#8aa5b8', attended: '#16a34a', completed: '#16a34a', cancelled: '#e11d48', pending: '#8aa5b8' };

function AppointmentCard({ appt, index }) {
  return (
    <View style={s.card}>
      <View style={[s.accent, { backgroundColor: appt.urgency === 'high' ? '#f59e0b' : TEAL }]} />
      <Text style={s.idx}>{index}</Text>
      <View style={s.timeCol}>
        <Text style={s.timeStart}>{appt.timeSlot?.start}</Text>
        <Text style={s.timeEnd}>{appt.timeSlot?.end}</Text>
      </View>
      <View style={s.info}>
        <Text style={s.name}>{appt.patientId?.name || 'مريض'}</Text>
        {appt.chiefComplaint ? <Text style={s.complaint} numberOfLines={1}>{appt.chiefComplaint}</Text> : null}
      </View>
      <View style={[s.badge, { backgroundColor: STATUS_COLOR[appt.status] || '#8aa5b8' }]}>
        <Text style={s.badgeText}>{STATUS_LABEL[appt.status] || appt.status}</Text>
      </View>
    </View>
  );
}

function SectionHeader({ emoji, title, count }) {
  return (
    <View style={s.secHeader}>
      <Text>{emoji}</Text>
      <Text style={s.secTitle}>{title}</Text>
      <View style={s.secBadge}><Text style={s.secBadgeText}>{count}</Text></View>
    </View>
  );
}

export default function TodayScreen() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [error, setError]               = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try { setAppointments((await getAppointments()) || []); }
    catch { setError('تعذّر تحميل المواعيد'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { current, upcoming } = groupTodayAppointments(appointments);
  const dateLabel = new Date().toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' });

  if (loading) return <SafeAreaView style={s.container}><ActivityIndicator size="large" color={TEAL} style={{ flex: 1 }} /></SafeAreaView>;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.headerDate}>{dateLabel}</Text>
        <Text style={s.headerTitle}>اليوم</Text>
      </View>
      <FlatList
        data={[]}
        renderItem={null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={TEAL} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={<>
          {error ? (
            <View style={s.center}>
              <Text style={s.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => load()} style={s.retryBtn}><Text style={s.retryText}>إعادة المحاولة</Text></TouchableOpacity>
            </View>
          ) : null}
          {!error && current.length === 0 && upcoming.length === 0 ? (
            <View style={s.center}><Text style={s.emptyText}>لا توجد مواعيد اليوم</Text></View>
          ) : null}
          {current.length > 0 && (
            <View style={s.section}>
              <SectionHeader emoji="🟢" title="الآن" count={current.length} />
              {current.map((a, i) => <AppointmentCard key={a._id} appt={a} index={i + 1} />)}
            </View>
          )}
          {upcoming.length > 0 && (
            <View style={s.section}>
              <SectionHeader emoji="📅" title="القادم" count={upcoming.length} />
              {upcoming.map((a, i) => <AppointmentCard key={a._id} appt={a} index={i + 1} />)}
            </View>
          )}
        </>}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#f8fafc' },
  header:       { backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#d0dce8', alignItems: 'flex-end' },
  headerDate:   { fontSize: 12, color: '#8aa5b8' },
  headerTitle:  { fontSize: 20, fontWeight: '700', color: '#0f1923', marginTop: 2 },
  section:      { margin: 16, backgroundColor: '#fff', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#d0dce8' },
  secHeader:    { flexDirection: 'row-reverse', alignItems: 'center', padding: 12, gap: 8 },
  secTitle:     { fontSize: 14, fontWeight: '600', color: '#0f1923', flex: 1, textAlign: 'right' },
  secBadge:     { backgroundColor: TEAL, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 },
  secBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  card:         { flexDirection: 'row-reverse', alignItems: 'center', padding: 12, borderTopWidth: 1, borderTopColor: '#d0dce8', gap: 10, position: 'relative' },
  accent:       { position: 'absolute', right: 0, top: 0, bottom: 0, width: 3 },
  idx:          { width: 22, height: 22, borderRadius: 11, backgroundColor: '#f1f5f9', textAlign: 'center', lineHeight: 22, fontSize: 11, color: '#8aa5b8', fontWeight: '600' },
  timeCol:      { alignItems: 'center', minWidth: 44 },
  timeStart:    { fontSize: 13, fontWeight: '700', color: TEAL },
  timeEnd:      { fontSize: 11, color: '#8aa5b8' },
  info:         { flex: 1, alignItems: 'flex-end' },
  name:         { fontSize: 14, fontWeight: '600', color: '#0f1923' },
  complaint:    { fontSize: 11, color: '#8aa5b8', marginTop: 2 },
  badge:        { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText:    { fontSize: 11, fontWeight: '700', color: '#fff' },
  center:       { padding: 40, alignItems: 'center' },
  errorText:    { color: '#e11d48', fontSize: 14, marginBottom: 12, textAlign: 'center' },
  retryBtn:     { backgroundColor: TEAL, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryText:    { color: '#fff', fontWeight: '600' },
  emptyText:    { color: '#8aa5b8', fontSize: 14 },
});
