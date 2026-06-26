import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addNote, updateNote } from '../../api/appointments';
import C from '../../constants/colors';

export default function NoteEditorScreen({ route, navigation }) {
  const { appointmentId, note } = route.params;
  const [content, setContent]   = useState(note?.content || '');
  const [isShared, setIsShared] = useState(note?.visibility === 'shared');
  const [saving, setSaving]     = useState(false);

  const handleSave = async () => {
    if (!content.trim()) {
      Alert.alert('Required', 'Note content cannot be empty');
      return;
    }
    setSaving(true);
    try {
      const visibility = isShared ? 'shared' : 'private';
      if (note?._id) {
        await updateNote(appointmentId, note._id, { content: content.trim(), visibility });
      } else {
        await addNote(appointmentId, { content: content.trim(), visibility });
      }
      navigation.goBack();
    } catch {
      Alert.alert('Error', 'Failed to save note. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>{note ? 'Edit Note' : 'New Note'}</Text>
      </View>

      <View style={{ padding: 16, flex: 1 }}>
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
      </View>
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
  saveBtn:         { backgroundColor: C.mint, borderRadius: 10, padding: 16, alignItems: 'center' },
  disabled:        { opacity: 0.5 },
  saveText:        { color: '#000', fontWeight: '700', fontSize: 15 },
});
