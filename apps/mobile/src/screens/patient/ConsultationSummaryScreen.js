import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getAppointment, getNotes } from '../../api/appointments';
import C from '../../constants/colors';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function ConsultationSummaryScreen({ route, navigation }) {
  const { appointmentId } = route.params;
  const [appt, setAppt]   = useState(null);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getAppointment(appointmentId), getNotes(appointmentId)])
      .then(([a, n]) => { setAppt(a.appointment || a); setNotes(n.notes || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [appointmentId]);

  if (loading) return (
    <SafeAreaView style={s.center}><ActivityIndicator color={C.mint} size="large" /></SafeAreaView>
  );

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>Consultation Summary</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={s.card}>
          <Text style={s.label}>DATE</Text>
          <Text style={s.value}>
            {appt ? new Date(appt.date || appt.scheduledAt).toLocaleDateString() : '—'}
          </Text>
          {appt?.timeSlot && (
            <Text style={s.sub}>{appt.timeSlot.start} – {appt.timeSlot.end}</Text>
          )}
        </View>

        {/* Reschedule suggestions — shown only when cancelled and suggestions exist */}
        {appt?.status === 'cancelled' &&
          Array.isArray(appt?.rescheduleSuggestions) &&
          appt.rescheduleSuggestions.length > 0 && (
            <View style={rs.container}>
              <Text style={rs.title}>Suggested alternatives</Text>
              {appt.rescheduleSuggestions.map((sg, idx) => (
                <View key={idx} style={rs.card}>
                  <View style={rs.header}>
                    <Text style={rs.day}>{DAY_NAMES[sg.dayOfWeek] || `Day ${sg.dayOfWeek}`}</Text>
                    <Text style={rs.time}>{sg.time}</Text>
                  </View>
                  <Text style={rs.reason}>{sg.reason}</Text>
                </View>
              ))}
              <Text style={rs.disclaimer}>AI-powered suggestion — availability may vary</Text>
            </View>
          )}

        <Text style={s.sectionTitle}>Doctor's Notes</Text>

        {notes.length === 0 ? (
          <Text style={s.empty}>No shared notes for this consultation.</Text>
        ) : (
          notes.map((note, idx) => (
            <View key={note._id} style={s.noteCard}>
              <Text style={s.noteIndex}>NOTE {idx + 1}</Text>
              <Text style={s.noteContent}>{note.content}</Text>
              <Text style={s.noteDate}>{new Date(note.updatedAt || note.createdAt).toLocaleDateString()}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  center:       { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  header:       { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  back:         { fontSize: 14, color: C.mint },
  title:        { fontSize: 18, fontWeight: '700', color: C.text },
  card:         { backgroundColor: C.card, borderRadius: 10, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border },
  label:        { fontSize: 10, fontWeight: '600', letterSpacing: 0.8, color: C.text2 },
  value:        { fontSize: 15, color: C.text, fontWeight: '500', marginTop: 2 },
  sub:          { fontSize: 13, color: C.text2, marginTop: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '600', letterSpacing: 0.8, color: C.text2, marginBottom: 10 },
  noteCard:     { backgroundColor: C.card, borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  noteIndex:    { fontSize: 10, fontWeight: '600', letterSpacing: 0.8, color: C.text2, marginBottom: 6 },
  noteContent:  { color: C.text, fontSize: 14, lineHeight: 21 },
  noteDate:     { color: C.text2, fontSize: 11, marginTop: 10, textAlign: 'right' },
  empty:        { color: C.text2, textAlign: 'center', marginTop: 30, fontSize: 14 },
});

const rs = StyleSheet.create({
  container:  { backgroundColor: C.bg3, borderRadius: 12, borderWidth: 1, borderColor: C.mint, padding: 14, marginBottom: 16 },
  title:      { fontSize: 13, fontWeight: '700', color: C.mint, marginBottom: 10, letterSpacing: 0.5 },
  card:       { backgroundColor: C.card, borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  header:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  day:        { fontSize: 12.5, fontWeight: '600', color: C.text },
  time:       { fontSize: 12.5, fontWeight: '700', color: C.mint },
  reason:     { fontSize: 12, color: C.text2, lineHeight: 17 },
  disclaimer: { fontSize: 10, color: C.text3, marginTop: 6, fontStyle: 'italic' },
});
