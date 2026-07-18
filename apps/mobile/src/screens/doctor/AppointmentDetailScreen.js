import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getAppointment, confirmAppointment, validateAppointment, getNotes, deleteNote, markRead } from '../../api/appointments';
import C from '../../constants/colors';

export default function AppointmentDetailScreen({ route, navigation }) {
  const { appointmentId } = route.params;
  const [appt, setAppt]   = useState(null);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getAppointment(appointmentId), getNotes(appointmentId)])
      .then(([a, n]) => { setAppt(a.appointment || a); setNotes(n.notes || []); })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        markRead(appointmentId).catch(() => {});
      });
  }, [appointmentId]);

  useFocusEffect(load);

  const handleConfirm = () => {
    Alert.alert('Confirm appointment', 'Confirm this appointment?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () =>
        confirmAppointment(appointmentId)
          .then(d => setAppt(d.appointment || d))
          .catch(() => Alert.alert('Error', 'Could not confirm appointment'))
      },
    ]);
  };

  const handleValidate = () => {
    Alert.alert('Validate consultation', 'Finalize this consultation? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Validate', style: 'destructive', onPress: () =>
        validateAppointment(appointmentId)
          .then(d => setAppt(d.appointment || d))
          .catch(() => Alert.alert('Error', 'Could not validate consultation'))
      },
    ]);
  };

  const handleDeleteNote = (noteId) => {
    Alert.alert('Delete note', 'Delete this note?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () =>
        deleteNote(appointmentId, noteId)
          .then(() => setNotes(ns => ns.filter(n => n._id !== noteId)))
          .catch(() => Alert.alert('Error', 'Could not delete note'))
      },
    ]);
  };

  if (loading) return (
    <SafeAreaView style={s.center}><ActivityIndicator color={C.mint} size="large" /></SafeAreaView>
  );

  const validated = appt?.status === 'validated';
  const STATUS_COLOR = { pending: C.amber, confirmed: C.blue, in_progress: C.mint, validated: C.text2, cancelled: C.rose };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>Consultation</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={s.card}>
          <Text style={s.label}>DATE</Text>
          <Text style={s.value}>{appt ? new Date(appt.date || appt.scheduledAt).toLocaleDateString() : '—'}</Text>
          {appt?.timeSlot && <Text style={s.sub}>{appt.timeSlot.start} – {appt.timeSlot.end}</Text>}
          <Text style={[s.label, { marginTop: 12 }]}>STATUS</Text>
          <Text style={[s.value, { color: STATUS_COLOR[appt?.status] || C.mint }]}>{appt?.status}</Text>
          {appt?.reason && <>
            <Text style={[s.label, { marginTop: 12 }]}>REASON</Text>
            <Text style={s.value}>{appt.reason}</Text>
          </>}
        </View>

        {/* AI-generated patient situation summary */}
        {appt?.chiefComplaint && (
          <View style={{ backgroundColor: C.mintDim, borderWidth: 1, borderColor: C.mint, borderRadius: 8, padding: 14, marginBottom: 16 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, color: C.mint, marginBottom: 6 }}>
              Patient Situation (AI Summary)
            </Text>
            <Text style={{ fontSize: 13, color: C.text, lineHeight: 20 }}>{appt.chiefComplaint}</Text>
          </View>
        )}

        {/* Patient Symptoms card */}
        {appt?.symptomText ? (
          <View style={{
            backgroundColor: C.bg2, borderWidth: 1, borderColor: C.border,
            borderRadius: 8, padding: 14, marginBottom: 16,
          }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 8 }}>
              Patient Symptoms
            </Text>
            <Text style={{ fontSize: 13, color: C.text, marginBottom: 12, lineHeight: 20 }}>
              {appt.symptomText}
            </Text>
            {appt.symptomAnalysis?.processedAt ? (
              appt.symptomAnalysis.urgency ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{
                    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12,
                    backgroundColor:
                      appt.symptomAnalysis.urgency === 'high'   ? '#ef4444' :
                      appt.symptomAnalysis.urgency === 'medium'  ? '#f59e0b' : '#22c55e',
                  }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>
                      {appt.symptomAnalysis.urgency}
                    </Text>
                  </View>
                  {appt.symptomAnalysis.category ? (
                    <Text style={{ fontSize: 13, color: C.text2 }}>{appt.symptomAnalysis.category}</Text>
                  ) : null}
                </View>
              ) : (
                <Text style={{ fontSize: 12, color: C.text2 }}>Analysis unavailable</Text>
              )
            ) : (
              <Text style={{ fontSize: 12, color: C.text2 }}>Analysis pending…</Text>
            )}
            <Text style={{ fontSize: 11, color: C.text3, marginTop: 10 }}>
              AI-generated — not a substitute for clinical judgment.
            </Text>
          </View>
        ) : null}

        <Text style={s.sectionTitle}>Notes ({notes.length})</Text>

        {notes.map(note => (
          <View key={note._id} style={[s.noteCard, { borderColor: note.visibility === 'private' ? C.amber : C.mint }]}>
            <Text style={s.noteContent}>{note.content}</Text>
            <View style={s.noteFooter}>
              <Text style={[s.badge, { color: note.visibility === 'private' ? C.amber : C.mint }]}>
                {note.visibility === 'private' ? '🔒 Private' : '👁 Shared'}
              </Text>
              {!validated && (
                <View style={s.noteActions}>
                  <TouchableOpacity onPress={() => navigation.navigate('NoteEditor', { appointmentId, note })}>
                    <Text style={s.editBtn}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteNote(note._id)}>
                    <Text style={s.deleteBtn}>Delete</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        ))}

        {!validated && (
          <TouchableOpacity style={s.addBtn} onPress={() => navigation.navigate('NoteEditor', { appointmentId })}>
            <Text style={s.addBtnText}>+ Add Note</Text>
          </TouchableOpacity>
        )}

        {(appt?.status === 'confirmed' || appt?.status === 'in_progress') && (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: '#7c3aed22', borderColor: '#7c3aed', marginBottom: 6 }]}
            onPress={() => navigation.navigate('VideoCall', {
              appointmentId,
              otherPartyName: appt?.patientId?.name || 'Patient',
              role: 'doctor',
            })}
          >
            <Text style={[s.actionBtnText, { color: '#a78bfa' }]}>🎥 Join Video</Text>
          </TouchableOpacity>
        )}

        {appt?.status !== 'cancelled' && (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: C.mint + '22', borderColor: C.mint, marginBottom: 6 }]}
            onPress={() => navigation.navigate('Chat', { appointmentId, otherPartyName: appt?.patientId?.name || 'Patient' })}
          >
            <Text style={[s.actionBtnText, { color: C.mint }]}>💬 Chat</Text>
          </TouchableOpacity>
        )}

        {appt?.status === 'pending' && (
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: C.blue + '22', borderColor: C.blue }]} onPress={handleConfirm}>
            <Text style={[s.actionBtnText, { color: C.blue }]}>Confirm Appointment</Text>
          </TouchableOpacity>
        )}

        {(appt?.status === 'confirmed' || appt?.status === 'in_progress') && (
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: C.mint + '22', borderColor: C.mint }]} onPress={handleValidate}>
            <Text style={[s.actionBtnText, { color: C.mint }]}>Validate Consultation</Text>
          </TouchableOpacity>
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
  noteCard:     { backgroundColor: C.card, borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1 },
  noteContent:  { color: C.text, fontSize: 14, lineHeight: 21 },
  noteFooter:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  badge:        { fontSize: 11, fontWeight: '600' },
  noteActions:  { flexDirection: 'row', gap: 16 },
  editBtn:      { color: C.blue, fontSize: 13, fontWeight: '500' },
  deleteBtn:    { color: C.rose, fontSize: 13, fontWeight: '500' },
  addBtn:       { borderWidth: 1, borderColor: C.mint, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4, marginBottom: 10 },
  addBtnText:   { color: C.mint, fontWeight: '600', fontSize: 14 },
  actionBtn:    { borderWidth: 1, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8 },
  actionBtnText:{ fontWeight: '700', fontSize: 15 },
});
