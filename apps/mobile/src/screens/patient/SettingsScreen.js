import React, { useState, useEffect } from 'react';
import { View, Text, Switch, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { getNotificationPrefs, updateNotificationPrefs } from '../../api/users';
import { useColors } from '../../constants/colors';
import useThemeStore from '../../store/themeStore';

export default function PatientSettingsScreen() {
  const navigation = useNavigation();
  const C = useColors();
  const { theme, setTheme } = useThemeStore();

  const [pushEnabled,  setPushEnabled]  = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);

  useEffect(() => {
    getNotificationPrefs().then(data => {
      if (data?.notificationPrefs) {
        setPushEnabled(data.notificationPrefs.pushEnabled);
        setEmailEnabled(data.notificationPrefs.emailEnabled);
      }
    }).catch(() => {});
  }, []);

  const sectionStyle = {
    backgroundColor: C.bg3, borderRadius: 8,
    borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 16,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} style={{ marginRight: 12 }}>
            <Text style={{ fontSize: 32, color: C.mint, lineHeight: 34 }}>‹</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 22, fontWeight: '700', color: C.text }}>Settings</Text>
        </View>

        {/* Notification Channels */}
        <View style={sectionStyle}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: C.text, marginBottom: 12 }}>
            Notification Channels
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ fontSize: 12, color: C.text2 }}>Push notifications</Text>
            <Switch
              value={pushEnabled}
              onValueChange={async (val) => {
                setPushEnabled(val);
                await updateNotificationPrefs({ pushEnabled: val }).catch(() => setPushEnabled(!val));
              }}
              trackColor={{ false: C.border, true: C.mint }}
              thumbColor="#fff"
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, color: C.text2 }}>Email notifications</Text>
            <Switch
              value={emailEnabled}
              onValueChange={async (val) => {
                setEmailEnabled(val);
                await updateNotificationPrefs({ emailEnabled: val }).catch(() => setEmailEnabled(!val));
              }}
              trackColor={{ false: C.border, true: C.mint }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Appearance */}
        <View style={sectionStyle}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: C.text, marginBottom: 12 }}>
            Appearance
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[
              { value: 'dark',  label: '🌙 Night' },
              { value: 'light', label: '☀️ Light' },
            ].map(opt => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setTheme(opt.value)}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center',
                  borderWidth: theme === opt.value ? 1.5 : 1,
                  borderColor: theme === opt.value ? C.mint : C.border,
                  backgroundColor: theme === opt.value ? C.mintDim : C.bg2,
                }}
                accessibilityLabel={`${opt.label} theme`}
                accessibilityRole="button"
              >
                <Text style={{
                  fontSize: 13,
                  fontWeight: theme === opt.value ? '600' : '400',
                  color: theme === opt.value ? C.mint : C.text2,
                }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
