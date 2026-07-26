import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Platform, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import useAuthStore from '../../store/authStore';
import C from '../../constants/colors';

const ACTIONS = [
  { icon: '🔍', labelKey: 'tabs.findDoctor',   screen: 'Find Doctor',   stack: true },
  { icon: '📅', labelKey: 'tabs.appointments', screen: 'Appointments',  stack: true },
  { icon: '📋', labelKey: 'tabs.records',      screen: 'Records',       stack: false },
  { icon: '🔔', labelKey: 'tabs.notifications',screen: 'Notifications', stack: false },
  { icon: '👤', labelKey: 'tabs.profile',      screen: 'Profile',       stack: false },
  { icon: '⚙️', labelKey: 'tabs.settings',     screen: 'Settings',      stack: false },
];

export default function HomeScreen() {
  const navigation = useNavigation();
  const { t }      = useTranslation();
  const user       = useAuthStore(s => s.user);
  const firstName  = user?.name?.split(' ')[0] || 'there';

  const headerTop = Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0;

  return (
    <SafeAreaView style={s.root}>
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: headerTop + 8 }]}>
        <View style={s.logoRow}>
          <Text style={s.logoIcon}>⚕️</Text>
          <Text style={s.logoText}>Medi<Text style={s.logoAccent}>connect</Text></Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        {/* ── Greeting ── */}
        <View style={s.greetingBox}>
          <Text style={s.greetingEmoji}>👋</Text>
          <Text style={s.greetingTitle}>Hello, {firstName}!</Text>
          <Text style={s.greetingSubtitle}>How can we help you today?</Text>
        </View>

        {/* ── Quick actions grid ── */}
        <View style={s.grid}>
          {ACTIONS.map(({ icon, labelKey, screen }) => (
            <TouchableOpacity
              key={screen}
              style={s.card}
              activeOpacity={0.75}
              onPress={() => navigation.navigate(screen)}
            >
              <Text style={s.cardIcon}>{icon}</Text>
              <Text style={s.cardLabel}>{t(labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const CARD_SIZE = '47%';

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  header: {
    backgroundColor: C.bg2,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  logoRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoIcon:    { fontSize: 22 },
  logoText:    { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: 0.3 },
  logoAccent:  { color: C.mint },

  body: { padding: 20, paddingBottom: 40 },

  greetingBox: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 22,
    alignItems: 'center',
    marginBottom: 24,
  },
  greetingEmoji:    { fontSize: 36, marginBottom: 8 },
  greetingTitle:    { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 4 },
  greetingSubtitle: { fontSize: 14, color: C.text2, textAlign: 'center' },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'space-between',
  },
  card: {
    width: CARD_SIZE,
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  cardIcon:  { fontSize: 32 },
  cardLabel: { fontSize: 13, fontWeight: '600', color: C.text, textAlign: 'center' },
});
