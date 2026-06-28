import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { getDoctor, getAvailableSlots, getSuggestedSlots } from '../../api/doctors';
import { getDoctorReviews } from '../../api/reviews';
import C from '../../constants/colors';

function toISO(d) { return d.toISOString().slice(0, 10); }
function dateLabel(d) { return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Returns the ISO date string for the next occurrence of dayOfWeek (0=Sun) at or after today. */
function nextDateForDay(dayOfWeek) {
  const today = new Date();
  const todayDow = today.getUTCDay();
  const diff = (dayOfWeek - todayDow + 7) % 7;
  const target = new Date(today);
  target.setUTCDate(today.getUTCDate() + diff);
  return toISO(target);
}

function Stars({ rating }) {
  const full = Math.round(rating);
  return (
    <Text>
      {[1, 2, 3, 4, 5].map(n => (
        <Text key={n} style={{ fontSize: 16, color: n <= full ? C.amber : C.border2 }}>★</Text>
      ))}
    </Text>
  );
}

function ReviewItem({ review }) {
  const name     = review.patientId?.name || 'Patient';
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('');
  const display  = `${name.split(' ')[0]} ${name.split(' ')[1]?.[0] || ''}.`;
  return (
    <View style={rs.item}>
      <View style={rs.avatar}><Text style={rs.initials}>{initials}</Text></View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={rs.name}>{display}</Text>
          <Stars rating={review.rating} />
        </View>
        {!!review.comment && <Text style={rs.comment}>{review.comment}</Text>}
        <Text style={rs.date}>{new Date(review.createdAt).toLocaleDateString()}</Text>
      </View>
    </View>
  );
}

export default function DoctorProfileScreen({ route, navigation }) {
  const { doctorId, doctorUserId } = route.params;
  const { t } = useTranslation();
  const [doctor, setDoctor]                   = useState(null);
  const [selectedDate, setSelectedDate]       = useState(toISO(new Date()));
  const [slots, setSlots]                     = useState([]);
  const [slotsLoading, setSlotsLoading]       = useState(false);
  const [reviewData, setReviewData]           = useState({ reviews: [], averageRating: 0, reviewCount: 0 });
  const [smartSuggestions, setSmartSuggestions] = useState([]);
  const [smartDisclaimer, setSmartDisclaimer]   = useState('');
  const [smartLoading, setSmartLoading]         = useState(false);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i); return d;
  });

  useEffect(() => { getDoctor(doctorId).then(setDoctor).catch(() => {}); }, [doctorId]);

  useEffect(() => {
    setSmartLoading(true);
    getSuggestedSlots(doctorId)
      .then(data => {
        setSmartSuggestions(data?.suggestions || []);
        setSmartDisclaimer(data?.disclaimer || '');
      })
      .catch(() => setSmartSuggestions([]))
      .finally(() => setSmartLoading(false));
  }, [doctorId]);
  useEffect(() => {
    if (doctorUserId) {
      getDoctorReviews(doctorUserId, 1).then(setReviewData).catch(() => {});
    }
  }, [doctorUserId]);
  useEffect(() => {
    setSlotsLoading(true);
    getAvailableSlots(doctorId, selectedDate)
      .then(setSlots)
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [doctorId, selectedDate]);

  if (!doctor) return <View style={s.center}><ActivityIndicator color={C.mint} /></View>;

  const name = doctor.userId?.name || 'Doctor';
  const { reviews, averageRating, reviewCount } = reviewData;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 16 }}>
          <Text style={{ color: C.mint, fontSize: 14 }}>← Back</Text>
        </TouchableOpacity>

        <View style={s.card}>
          <View style={s.avatar}><Text style={s.avatarTxt}>{name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('')}</Text></View>
          <Text style={s.name}>{name}</Text>
          <Text style={s.specialty}>{doctor.specialty}</Text>
          {doctor.bio ? <Text style={s.bio}>{doctor.bio}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
            {doctor.consultationFee > 0 && <Text style={s.meta}>{doctor.consultationFee} SAR</Text>}
            {doctor.yearsOfExperience > 0 && <Text style={s.meta}>{doctor.yearsOfExperience}y exp</Text>}
          </View>
          {reviewCount > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <Stars rating={averageRating} />
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.amber }}>{averageRating}</Text>
              <Text style={{ fontSize: 12, color: C.text3 }}>({reviewCount} {t('reviews.title').toLowerCase()})</Text>
            </View>
          )}
        </View>

        <Text style={s.sectionTitle}>Pick a date</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          {days.map(d => {
            const iso = toISO(d);
            const active = iso === selectedDate;
            return (
              <TouchableOpacity key={iso} onPress={() => setSelectedDate(iso)}
                style={[s.dateChip, active && s.dateChipActive]}>
                <Text style={[s.dateChipTxt, active && s.dateChipTxtActive]}>{dateLabel(d)}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={s.sectionTitle}>Available times</Text>
        {slotsLoading && <ActivityIndicator color={C.mint} style={{ margin: 16 }} />}
        {!slotsLoading && slots.length === 0 && <Text style={s.empty}>No availability on this day.</Text>}
        <View style={s.slotsGrid}>
          {slots.map(sl => (
            <TouchableOpacity key={sl.time} disabled={!sl.available}
              onPress={() => navigation.navigate('BookAppointment', {
                doctorUserId,
                doctorName: name,
                specialty: doctor.specialty,
                date: selectedDate,
                slot: sl.time,
              })}
              style={[s.slotBtn, !sl.available && s.slotBtnTaken]}>
              <Text style={[s.slotTxt, !sl.available && s.slotTxtTaken]}>{sl.time}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Smart Suggestions section */}
        {(smartLoading || smartSuggestions.length > 0) && (
          <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
            <Text style={s.sectionTitle}>Smart suggestions</Text>
            {smartLoading ? (
              <ActivityIndicator color={C.mint} style={{ marginTop: 8 }} />
            ) : (
              <>
                {smartSuggestions.map((sg, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => {
                      const date = nextDateForDay(sg.dayOfWeek);
                      setSelectedDate(date);
                    }}
                    style={ss.suggCard}
                  >
                    <View style={ss.suggHeader}>
                      <Text style={ss.suggDay}>{DAY_NAMES[sg.dayOfWeek]}</Text>
                      <Text style={ss.suggTime}>{sg.time}</Text>
                    </View>
                    <Text style={ss.suggReason}>{sg.reason}</Text>
                  </TouchableOpacity>
                ))}
                {!!smartDisclaimer && (
                  <Text style={ss.disclaimer}>{smartDisclaimer}</Text>
                )}
              </>
            )}
          </View>
        )}

        {reviews.length > 0 && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            <Text style={s.sectionTitle}>{t('reviews.title')}</Text>
            {reviews.slice(0, 5).map(r => <ReviewItem key={r._id} review={r} />)}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: C.bg },
  center:            { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  card:              { margin: 16, padding: 20, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  avatar:            { width: 64, height: 64, borderRadius: 32, backgroundColor: C.mint, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarTxt:         { fontSize: 22, fontWeight: '700', color: '#000' },
  name:              { fontSize: 18, fontWeight: '700', color: C.text },
  specialty:         { fontSize: 13, color: C.mint, marginTop: 4 },
  bio:               { fontSize: 12.5, color: C.text2, marginTop: 8, textAlign: 'center' },
  meta:              { fontSize: 12, color: C.text3, backgroundColor: C.bg3, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  sectionTitle:      { fontSize: 13, fontWeight: '600', color: C.text2, marginHorizontal: 16, marginBottom: 8 },
  dateChip:          { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.border2, backgroundColor: C.bg2, marginRight: 8 },
  dateChipActive:    { borderColor: C.mint, backgroundColor: C.bg3 },
  dateChipTxt:       { fontSize: 12, color: C.text2 },
  dateChipTxtActive: { color: C.mint, fontWeight: '600' },
  slotsGrid:         { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8, marginBottom: 20 },
  slotBtn:           { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: C.mint, backgroundColor: C.bg3 },
  slotBtnTaken:      { borderColor: C.border, opacity: 0.4 },
  slotTxt:           { fontSize: 13, color: C.mint, fontWeight: '500' },
  slotTxtTaken:      { color: C.text3 },
  empty:             { fontSize: 12, color: C.text3, marginHorizontal: 16, marginBottom: 16 },
});

const rs = StyleSheet.create({
  item:     { flexDirection: 'row', gap: 10, padding: 12, backgroundColor: C.bg3, borderRadius: 10, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
  avatar:   { width: 36, height: 36, borderRadius: 18, backgroundColor: C.mintDim, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  initials: { fontSize: 12, fontWeight: '700', color: C.mint },
  name:     { fontSize: 12.5, fontWeight: '600', color: C.text },
  comment:  { fontSize: 12, color: C.text2, marginTop: 4, lineHeight: 17 },
  date:     { fontSize: 10, color: C.text3, marginTop: 4 },
});

const ss = StyleSheet.create({
  suggCard:    { backgroundColor: C.bg3, borderRadius: 10, borderWidth: 1, borderColor: C.mint, padding: 12, marginBottom: 8 },
  suggHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  suggDay:     { fontSize: 13, fontWeight: '600', color: C.mint },
  suggTime:    { fontSize: 13, fontWeight: '700', color: C.text },
  suggReason:  { fontSize: 12, color: C.text2, lineHeight: 17 },
  disclaimer:  { fontSize: 10, color: C.text3, marginTop: 6, fontStyle: 'italic' },
});
