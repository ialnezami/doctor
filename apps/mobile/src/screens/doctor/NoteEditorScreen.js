import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, ActivityIndicator, StyleSheet, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addNote, updateNote, getNotes, analyzeNote } from '../../api/appointments';
import C from '../../constants/colors';

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 5; // 5 × 2 s = 10 s total

export default function NoteEditorScreen({ route, navigation }) {
  const { appointmentId, note } = route.params;
  const [content, setContent]   = useState(note?.content || '');
  const [isShared, setIsShared] = useState(note?.visibility === 'shared');
  const [saving, setSaving]     = useState(false);

  // AI Assist state
  const [savedNoteId, setSavedNoteId] = useState(note?._id || null);
  const [analyzing, setAnalyzing]     = useState(false);
  const [aiResult, setAiResult]       = useState(note?.aiAssist?.processedAt ? note.aiAssist : null);
  const pollRef = useRef(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const handleSave = async () => {
    if (!content.trim()) {
      Alert.alert('Required', 'Note content cannot be empty');
      return;
    }
    setSaving(true);
    try {
      const visibility = isShared ? 'shared' : 'private';
      let savedNote;
      if (note?._id) {
        savedNote = await updateNote(appointmentId, note._id, { content: content.trim(), visibility });
        setSavedNoteId(note._id);
      } else {
        savedNote = await addNote(appointmentId, { content: content.trim(), visibility });
        setSavedNoteId(savedNote.note?._id || savedNote._id);
      }
      navigation.goBack();
    } catch {
      Alert.alert('Error', 'Failed to save note. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleAnalyze = async () => {
    const targetId = savedNoteId;
    if (!targetId) {
      Alert.alert('Save first', 'Save the note before running AI analysis.');
      return;
    }

    setAnalyzing(true);
    setAiResult(null);
    stopPolling();

    try {
      await analyzeNote(appointmentId, targetId);
    } catch {
      setAnalyzing(false);
      Alert.alert('Error', 'Failed to queue analysis. Please try again.');
      return;
    }

    // Poll GET /appointments/:apptId/notes every 2 s for up to 10 s
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const { notes } = await getNotes(appointmentId);
        const fresh = notes.find(n => String(n._id) === String(targetId));
        if (fresh?.aiAssist?.processedAt) {
          setAiResult(fresh.aiAssist);
          setAnalyzing(false);
          stopPolling();
          return;
        }
      } catch (_) {}
      if (attempts >= POLL_MAX_ATTEMPTS) {
        setAnalyzing(false);
        stopPolling();
        Alert.alert('Timeout', 'Analysis is taking longer than expected. Check back later.');
      }
    }, POLL_INTERVAL_MS);
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => { stopPolling(); navigation.goBack(); }}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>{note ? 'Edit Note' : 'New Note'}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <TextInput
          style={s.input}
          multiline
          placeholder="Write your clinical notes here..."
          placeholderTextColor={C.text2}
          value={content}
          onChangeText={setContent}
          maxLength={5000}
        />
        <Text style={s.charCount}>{content.length} / 5000</Text>

        <View style={s.visibilityRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.visibilityLabel}>Share with patient</Text>
            <Text style={s.visibilitySub}>
              {isShared
                ? 'Patient sees this after you validate the consultation'
                : 'Private — only visible to you'}
            </Text>
          </View>
          <Switch
            value={isShared}
            onValueChange={setIsShared}
            trackColor={{ true: C.mint, false: C.border }}
            thumbColor="#fff"
          />
        </View>

        <TouchableOpacity
          style={[s.saveBtn, saving && s.disabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#000" />
            : <Text style={s.saveText}>Save Note</Text>
          }
        </TouchableOpacity>

        {/* AI Assist — only available once a note has been saved */}
        {savedNoteId && (
          <TouchableOpacity
            style={[s.aiBtn, analyzing && s.disabled]}
            onPress={handleAnalyze}
            disabled={analyzing}
          >
            {analyzing
              ? <><ActivityIndicator color={C.mint} style={{ marginRight: 8 }} /><Text style={s.aiText}>Analyzing…</Text></>
              : <Text style={s.aiText}>AI Assist</Text>
            }
          </TouchableOpacity>
        )}

        {aiResult && (
          <View style={s.aiCard}>
            <Text style={s.aiCardTitle}>AI Analysis</Text>

            {/* ICD-10 codes */}
            {aiResult.icdCodes?.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionLabel}>Suggested ICD-10 Codes</Text>
                <View style={s.chipRow}>
                  {aiResult.icdCodes.map((entry, i) => (
                    <View key={i} style={s.chip}>
                      <Text style={s.chipCode}>{entry.code}</Text>
                      <Text style={s.chipDesc}>{entry.description}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Patient-friendly summary */}
            {aiResult.patientSummary && (
              <View style={s.section}>
                <Text style={s.sectionLabel}>Patient-Friendly Summary</Text>
                <View style={s.summaryBox}>
                  <Text style={s.summaryText}>{aiResult.patientSummary}</Text>
                </View>
              </View>
            )}

            {/* Flags */}
            {aiResult.flags?.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionLabel}>Missing Information</Text>
                {aiResult.flags.map((flag, i) => (
                  <View key={i} style={s.flagRow}>
                    <Text style={s.flagIcon}>⚠</Text>
                    <Text style={s.flagText}>{flag}</Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={s.disclaimer}>
              AI-generated — not a substitute for clinical judgment.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: C.bg },
  header:          { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  back:            { fontSize: 14, color: C.mint },
  title:           { fontSize: 18, fontWeight: '700', color: C.text },
  input:           { backgroundColor: C.card, borderRadius: 10, padding: 14, color: C.text, fontSize: 14, minHeight: 160, textAlignVertical: 'top', borderWidth: 1, borderColor: C.border },
  charCount:       { color: C.text2, fontSize: 11, textAlign: 'right', marginTop: 6 },
  visibilityRow:   { flexDirection: 'row', alignItems: 'center', marginVertical: 20, backgroundColor: C.card, borderRadius: 10, padding: 16, borderWidth: 1, borderColor: C.border },
  visibilityLabel: { color: C.text, fontWeight: '600', fontSize: 15 },
  visibilitySub:   { color: C.text2, fontSize: 12, marginTop: 3 },
  saveBtn:         { backgroundColor: C.mint, borderRadius: 10, padding: 16, alignItems: 'center', marginBottom: 12 },
  disabled:        { opacity: 0.5 },
  saveText:        { color: '#000', fontWeight: '700', fontSize: 15 },
  aiBtn:           { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: C.mint, marginBottom: 20 },
  aiText:          { color: C.mint, fontWeight: '600', fontSize: 14 },

  // AI result card
  aiCard:          { backgroundColor: C.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border },
  aiCardTitle:     { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 14 },
  section:         { marginBottom: 14 },
  sectionLabel:    { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, color: C.text2, marginBottom: 8 },

  chipRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:            { backgroundColor: 'rgba(15,227,176,0.1)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(15,227,176,0.25)', maxWidth: '100%' },
  chipCode:        { color: C.mint, fontWeight: '700', fontSize: 12 },
  chipDesc:        { color: C.text2, fontSize: 11, marginTop: 2 },

  summaryBox:      { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 12, borderLeftWidth: 3, borderLeftColor: C.mint },
  summaryText:     { color: C.text, fontSize: 13, lineHeight: 20 },

  flagRow:         { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  flagIcon:        { color: '#f59e0b', fontSize: 14, marginTop: 1 },
  flagText:        { color: '#f59e0b', fontSize: 13, flex: 1 },

  disclaimer:      { fontSize: 11, color: C.text2, fontStyle: 'italic', marginTop: 10, textAlign: 'center' },
});
