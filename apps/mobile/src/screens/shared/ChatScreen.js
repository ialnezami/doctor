import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, StyleSheet, KeyboardAvoidingView, Platform,
  ActionSheetIOS,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { io } from 'socket.io-client';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import Constants from 'expo-constants';
import useAuthStore from '../../store/authStore';
import { getMessages, uploadAttachment } from '../../api/chat';
import C from '../../constants/colors';

function getSocketUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace('/api', '');
  }
  const host = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';
  return `http://${host}:3001`;
}

export default function ChatScreen({ route, navigation }) {
  const { appointmentId, otherPartyName } = route.params;
  const { token, user } = useAuthStore();

  const [messages, setMessages]       = useState([]);
  const [text, setText]               = useState('');
  const [loading, setLoading]         = useState(true);
  const [uploading, setUploading]     = useState(false);
  const [oldestId, setOldestId]       = useState(null);
  const [hasMore, setHasMore]         = useState(true);
  const [otherLastRead, setOtherLastRead] = useState(null);

  const socketRef = useRef(null);
  const listRef   = useRef(null);

  const loadHistory = useCallback(async (before) => {
    try {
      const res = await getMessages(appointmentId, before);
      const fetched = res.messages || [];
      if (!before) {
        setMessages(fetched);
      } else {
        setMessages(prev => [...fetched, ...prev]);
      }
      if (fetched.length > 0) setOldestId(fetched[0]._id);
      if (fetched.length < 20) setHasMore(false);
    } catch {
      Alert.alert('Error', 'Could not load messages');
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    loadHistory(null);

    const socket = io(getSocketUrl(), {
      auth: { token },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_chat', { appointmentId });
      socket.emit('mark_read', { appointmentId });
    });

    socket.on('new_message', (msg) => {
      setMessages(prev => [...prev, msg]);
    });

    socket.on('read_receipt', ({ userId, lastReadAt }) => {
      if (userId !== user.id) {
        setOtherLastRead(new Date(lastReadAt));
      }
    });

    socket.on('chat_error', (err) => {
      Alert.alert('Chat error', err);
    });

    return () => {
      socket.disconnect();
    };
  }, [appointmentId, token]);

  const onFocus = useCallback(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('mark_read', { appointmentId });
    }
  }, [appointmentId]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', onFocus);
    return unsubscribe;
  }, [navigation, onFocus]);

  const sendText = () => {
    const trimmed = text.trim();
    if (!trimmed || !socketRef.current?.connected) return;
    socketRef.current.emit('send_message', { appointmentId, type: 'text', text: trimmed });
    setText('');
  };

  const pickAttachment = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Image', 'File'], cancelButtonIndex: 0 },
        (idx) => {
          if (idx === 1) pickImage();
          if (idx === 2) pickFile();
        }
      );
    } else {
      Alert.alert('Attach', 'Choose type', [
        { text: 'Image', onPress: pickImage },
        { text: 'File',  onPress: pickFile },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission denied'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    sendFile({ uri: asset.uri, name: asset.fileName || 'image.jpg', mimeType: asset.type || 'image/jpeg' });
  };

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    sendFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType });
  };

  const sendFile = async (file) => {
    setUploading(true);
    try {
      const { fileUrl, fileName, type } = await uploadAttachment(appointmentId, file);
      socketRef.current?.emit('send_message', { appointmentId, type, fileUrl, fileName });
    } catch {
      Alert.alert('Upload failed', 'Could not upload attachment');
    } finally {
      setUploading(false);
    }
  };

  const loadMore = () => {
    if (!hasMore || !oldestId) return;
    loadHistory(oldestId);
  };

  const renderItem = ({ item: msg }) => {
    const senderStr = msg.senderId?._id ? String(msg.senderId._id) : String(msg.senderId ?? '');
    const mine = senderStr === String(user.id);
    const ts   = new Date(msg.createdAt);
    const seen = mine && otherLastRead && otherLastRead > new Date(msg.createdAt);

    const isLastMine = mine && messages[messages.length - 1]?._id === msg._id;

    return (
      <View style={[s.row, mine ? s.rowRight : s.rowLeft]}>
        <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleOther]}>
          {msg.type === 'text' && (
            <Text style={[s.msgText, mine ? s.textMine : s.textOther]}>{msg.text}</Text>
          )}
          {msg.type === 'image' && (
            <Text style={[s.msgText, mine ? s.textMine : s.textOther]}>📷 {msg.fileName || 'Image'}</Text>
          )}
          {msg.type === 'file' && (
            <Text style={[s.msgText, mine ? s.textMine : s.textOther]}>📎 {msg.fileName || 'File'}</Text>
          )}
          <Text style={s.ts}>{ts.getHours()}:{String(ts.getMinutes()).padStart(2, '0')}</Text>
        </View>
        {isLastMine && seen && (
          <Text style={s.seen}>Seen</Text>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={s.center}>
        <ActivityIndicator color={C.mint} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>{otherPartyName}</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12 }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.1}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />

        <View style={s.inputBar}>
          <TouchableOpacity style={s.attachBtn} onPress={pickAttachment} disabled={uploading}>
            <Text style={{ fontSize: 20 }}>{uploading ? '⏳' : '📎'}</Text>
          </TouchableOpacity>
          <TextInput
            style={s.input}
            value={text}
            onChangeText={setText}
            placeholder="Type a message…"
            placeholderTextColor={C.text3}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!text.trim() && !uploading) && s.sendDisabled]}
            onPress={sendText}
            disabled={!text.trim()}
          >
            <Text style={s.sendTxt}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.bg },
  center:      { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  back:        { fontSize: 14, color: C.mint },
  title:       { fontSize: 16, fontWeight: '700', color: C.text, flex: 1 },
  row:         { marginBottom: 6 },
  rowRight:    { alignItems: 'flex-end' },
  rowLeft:     { alignItems: 'flex-start' },
  bubble:      { maxWidth: '75%', borderRadius: 14, padding: 10 },
  bubbleMine:  { backgroundColor: C.mint + '33', borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: C.bg3, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: C.border },
  msgText:     { fontSize: 14, lineHeight: 20 },
  textMine:    { color: C.text },
  textOther:   { color: C.text },
  ts:          { fontSize: 10, color: C.text3, marginTop: 4, textAlign: 'right' },
  seen:        { fontSize: 10, color: C.text3, marginTop: 2, marginRight: 4 },
  inputBar:    { flexDirection: 'row', alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: C.border, padding: 10, gap: 8, backgroundColor: C.bg2 },
  attachBtn:   { padding: 6 },
  input:       { flex: 1, backgroundColor: C.bg3, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, color: C.text, fontSize: 14, maxHeight: 100, borderWidth: 1, borderColor: C.border },
  sendBtn:     { backgroundColor: C.mint, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  sendDisabled:{ opacity: 0.4 },
  sendTxt:     { color: '#000', fontWeight: '700', fontSize: 13 },
});
