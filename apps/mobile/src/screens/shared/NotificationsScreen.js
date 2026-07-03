import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { listNotifications, markNotificationRead, markAllRead } from '../../api/notifications';
import C from '../../constants/colors';

const TYPE_ICON = {
  appointment_requested:  '📅',
  appointment_confirmed:  '✅',
  consultation_validated: '📋',
  notes_viewed:           '👁',
};

export default function NotificationsScreen() {
  const navigation = useNavigation();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [loading, setLoading]             = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    listNotifications()
      .then(d => { setNotifications(d.notifications || []); setUnreadCount(d.unreadCount || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(load);

  const handleMarkRead = async (id) => {
    await markNotificationRead(id).catch(() => {});
    setNotifications(ns => ns.map(n => n._id === id ? { ...n, read: true } : n));
    setUnreadCount(c => Math.max(0, c - 1));
  };

  const handleMarkAll = async () => {
    await markAllRead().catch(() => {});
    setNotifications(ns => ns.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  if (loading) return (
    <SafeAreaView style={s.center}><ActivityIndicator color={C.mint} size="large" /></SafeAreaView>
  );

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={8}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.title}>
          Notifications{unreadCount > 0 ? <Text style={s.badge}> ({unreadCount})</Text> : null}
        </Text>
        {unreadCount > 0 ? (
          <TouchableOpacity onPress={handleMarkAll}>
            <Text style={s.markAll}>Mark all read</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.headerSpacer} />
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={item => item._id}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[s.card, !item.read && s.unread]}
            onPress={() => !item.read && handleMarkRead(item._id)}
            activeOpacity={item.read ? 1 : 0.7}
          >
            <Text style={s.icon}>{TYPE_ICON[item.type] || '🔔'}</Text>
            <View style={s.body}>
              <Text style={s.message}>{item.payload?.message || item.type.replace(/_/g, ' ')}</Text>
              <Text style={s.time}>{new Date(item.createdAt).toLocaleString()}</Text>
            </View>
            {!item.read && <View style={s.dot} />}
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={s.empty}>No notifications yet</Text>}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center:    { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  header:       { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn:      { marginRight: 12 },
  backArrow:    { fontSize: 32, color: C.mint, lineHeight: 34 },
  headerSpacer: { width: 70 },
  title:        { flex: 1, fontSize: 20, fontWeight: '700', color: C.text },
  badge:     { color: C.mint },
  markAll:   { color: C.blue, fontSize: 13 },
  card:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: C.border },
  unread:    { borderColor: C.mint },
  icon:      { fontSize: 20, marginRight: 12 },
  body:      { flex: 1 },
  message:   { color: C.text, fontSize: 14 },
  time:      { color: C.text2, fontSize: 11, marginTop: 3 },
  dot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: C.mint },
  empty:     { color: C.text2, textAlign: 'center', marginTop: 40, fontSize: 14 },
});
