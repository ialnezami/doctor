import React, { useState, useEffect } from 'react';
import { View, Text, Switch, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getNotificationPrefs, updateNotificationPrefs } from '../../api/users';
import C from '../../constants/colors';

export default function PatientSettingsScreen() {
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 20 }}>
          Settings
        </Text>

        <View style={{ backgroundColor: C.bg3, borderRadius: 8, borderWidth: 1, borderColor: C.border, padding: 12 }}>
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
      </ScrollView>
    </SafeAreaView>
  );
}
