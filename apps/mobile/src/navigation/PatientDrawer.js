import React, { useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Animated,
  StyleSheet, Pressable, Platform, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import C from '../constants/colors';
import useAuthStore from '../store/authStore';
import PatientBottomTabs from './PatientBottomTabs';

const DRAWER_WIDTH = 270;
const ANIM_OPEN = 250;
const ANIM_CLOSE = 200;

const DRAWER_ITEMS = [
  { icon: '📋', labelKey: 'tabs.records',  screen: 'Records'  },
  { icon: '👤', labelKey: 'tabs.profile',  screen: 'Profile'  },
  { icon: '⚙️', labelKey: 'tabs.settings', screen: 'Settings' },
];

export default function PatientDrawer() {
  const navigation  = useNavigation();
  const { t }       = useTranslation();
  const logout      = useAuthStore(s => s.logout);
  const insets      = useSafeAreaInsets();
  const translateX  = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const [open, setOpen] = useState(false);

  const openDrawer = useCallback(() => {
    setOpen(true);
    Animated.timing(translateX, {
      toValue: 0, duration: ANIM_OPEN, useNativeDriver: true,
    }).start();
  }, [translateX]);

  const closeDrawer = useCallback(() => {
    Animated.timing(translateX, {
      toValue: -DRAWER_WIDTH, duration: ANIM_CLOSE, useNativeDriver: true,
    }).start(() => setOpen(false));
  }, [translateX]);

  const navigateTo = useCallback((screen) => {
    closeDrawer();
    setTimeout(() => navigation.navigate(screen), ANIM_CLOSE + 30);
  }, [closeDrawer, navigation]);

  const headerTop = insets.top + (Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0);

  return (
    <View style={styles.root}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: headerTop + 12 }]}>
        <TouchableOpacity onPress={openDrawer} style={styles.headerBtn} hitSlop={8}>
          <Text style={styles.hamburger}>☰</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Salamtak</Text>

        <TouchableOpacity
          onPress={() => navigation.navigate('Notifications')}
          style={styles.headerBtn}
          hitSlop={8}
        >
          <Text style={{ fontSize: 22 }}>🔔</Text>
        </TouchableOpacity>
      </View>

      {/* ── Main content ── */}
      <View style={styles.content}>
        <PatientBottomTabs />
      </View>

      {/* ── Backdrop ── */}
      {open && (
        <Pressable style={styles.backdrop} onPress={closeDrawer} />
      )}

      {/* ── Drawer panel ── */}
      <Animated.View style={[styles.drawer, { transform: [{ translateX }] }]}>
        <View style={[styles.drawerHeader, { paddingTop: insets.top + 20 }]}>
          <Text style={styles.drawerTitle}>Salamtak</Text>
          <Text style={styles.drawerSub}>{t('tabs.profile', 'Patient')}</Text>
        </View>

        {DRAWER_ITEMS.map(({ icon, labelKey, screen }) => (
          <TouchableOpacity
            key={screen}
            style={styles.drawerItem}
            onPress={() => navigateTo(screen)}
          >
            <Text style={styles.drawerIcon}>{icon}</Text>
            <Text style={styles.drawerItemText}>{t(labelKey)}</Text>
          </TouchableOpacity>
        ))}

        <View style={styles.drawerDivider} />

        <TouchableOpacity
          style={[styles.drawerItem, styles.logoutItem]}
          onPress={() => { closeDrawer(); setTimeout(logout, ANIM_CLOSE + 30); }}
        >
          <Text style={styles.drawerIcon}>🚪</Text>
          <Text style={styles.logoutText}>{t('profile.logout', 'Sign out')}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.bg2,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerBtn:    { padding: 4 },
  hamburger:    { fontSize: 22, color: C.mint },
  headerTitle:  { color: C.text, fontSize: 18, fontWeight: '600', letterSpacing: 0.3 },

  content: { flex: 1 },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 10,
  },

  drawer: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0,
    width: DRAWER_WIDTH,
    backgroundColor: C.bg2,
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 16,
  },
  drawerHeader: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginBottom: 8,
  },
  drawerTitle:    { color: C.mint,  fontSize: 22, fontWeight: 'bold', letterSpacing: 0.5 },
  drawerSub:      { color: C.text2, fontSize: 13, marginTop: 4 },

  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginVertical: 2,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  drawerIcon:     { fontSize: 18, marginRight: 14 },
  drawerItemText: { color: C.text, fontSize: 16 },
  drawerDivider:  { height: 1, backgroundColor: C.border, marginHorizontal: 20, marginVertical: 8 },
  logoutItem:     {},
  logoutText:     { color: C.rose, fontSize: 16 },
});
