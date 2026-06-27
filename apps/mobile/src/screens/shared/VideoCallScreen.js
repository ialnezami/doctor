import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Alert, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import { getVideoToken } from '../../api/video';
import { addNote } from '../../api/appointments';
import C from '../../constants/colors';

export default function VideoCallScreen({ route, navigation }) {
  const { appointmentId, otherPartyName, role } = route.params;

  const [loading, setLoading]       = useState(true);
  const [callUrl, setCallUrl]       = useState(null);
  const [waiting, setWaiting]       = useState(true);
  const [notesOpen, setNotesOpen]   = useState(false);
  const [noteText, setNoteText]     = useState('');
  const [saving, setSaving]         = useState(false);
  const waitTimerRef = useRef(null);

  useEffect(() => {
    getVideoToken(appointmentId)
      .then(({ roomUrl, token }) => {
        setCallUrl(`${roomUrl}?t=${token}`);
        setLoading(false);
        // Auto-dismiss waiting banner after 30s
        waitTimerRef.current = setTimeout(() => setWaiting(false), 30000);
      })
      .catch(() => {
        Alert.alert('Error', 'Could not start video session', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      });

    return () => {
      if (waitTimerRef.current) clearTimeout(waitTimerRef.current);
    };
  }, [appointmentId]);

  const saveNote = async () => {
    if (!noteText.trim()) return;
    setSaving(true);
    try {
      await addNote(appointmentId, { content: noteText.trim(), visibility: 'private' });
      setNoteText('');
      setNotesOpen(false);
    } catch {
      Alert.alert('Error', 'Could not save note');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.center}>
        <ActivityIndicator color={C.mint} size="large" />
        <Text style={s.loadingText}>Starting video session…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backTxt}>✕ End</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{otherPartyName}</Text>
      </View>

      <View style={{ flex: 1 }}>
        {waiting && (
          <View style={s.waitingBanner}>
            <Text style={s.waitingText}>Waiting for {otherPartyName}…</Text>
            <TouchableOpacity onPress={() => setWaiting(false)}>
              <Text style={s.waitingDismiss}>✓ Connected</Text>
            </TouchableOpacity>
          </View>
        )}

        <WebView
          source={{ uri: callUrl }}
          style={{ flex: 1 }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
        />

        {role === 'doctor' && (
          <TouchableOpacity style={s.notesBtn} onPress={() => setNotesOpen(true)}>
            <Text style={s.notesBtnTxt}>📝</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={notesOpen} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={s.notesDrawer}>
            <View style={s.drawerHeader}>
              <Text style={s.drawerTitle}>In-call Note</Text>
              <TouchableOpacity onPress={() => setNotesOpen(false)}>
                <Text style={s.drawerClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={s.noteInput}
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Private note (visible only to you)…"
              placeholderTextColor={C.text3}
              multiline
              maxLength={2000}
              autoFocus
            />
            <View style={s.drawerActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setNotesOpen(false)}>
                <Text style={s.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.saveBtn, (!noteText.trim() || saving) && s.saveBtnDisabled]}
                onPress={saveNote}
                disabled={!noteText.trim() || saving}
              >
                <Text style={s.saveTxt}>{saving ? 'Saving…' : 'Save Note'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#000' },
  center:          { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText:     { color: C.text2, fontSize: 14 },
  header:          { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: 'rgba(0,0,0,0.8)' },
  backBtn:         { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, backgroundColor: 'rgba(244,63,94,0.2)', borderWidth: 1, borderColor: 'rgba(244,63,94,0.4)' },
  backTxt:         { color: '#f43f5e', fontSize: 13, fontWeight: '700' },
  headerTitle:     { flex: 1, color: '#fff', fontSize: 15, fontWeight: '600' },
  waitingBanner:   { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 16, paddingVertical: 10 },
  waitingText:     { color: '#fff', fontSize: 13 },
  waitingDismiss:  { color: C.mint, fontSize: 13, fontWeight: '700' },
  notesBtn:        { position: 'absolute', bottom: 24, right: 20, width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  notesBtnTxt:     { fontSize: 22 },
  modalOverlay:    { flex: 1, justifyContent: 'flex-end' },
  notesDrawer:     { backgroundColor: C.bg2, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, borderTopWidth: 1, borderTopColor: C.border },
  drawerHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  drawerTitle:     { fontSize: 16, fontWeight: '700', color: C.text },
  drawerClose:     { fontSize: 18, color: C.text2, paddingHorizontal: 4 },
  noteInput:       { backgroundColor: C.bg3, borderRadius: 10, padding: 12, color: C.text, fontSize: 14, minHeight: 100, textAlignVertical: 'top', borderWidth: 1, borderColor: C.border, marginBottom: 14 },
  drawerActions:   { flexDirection: 'row', gap: 10 },
  cancelBtn:       { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  cancelTxt:       { color: C.text2, fontSize: 14 },
  saveBtn:         { flex: 1, padding: 12, borderRadius: 10, backgroundColor: C.mint, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.4 },
  saveTxt:         { color: '#000', fontSize: 14, fontWeight: '700' },
});
