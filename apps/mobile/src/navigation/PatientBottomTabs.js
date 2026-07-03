import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import C from '../constants/colors';

import PatientStack from './PatientStack';
import MyAppointmentsScreen from '../screens/patient/MyAppointmentsScreen';

const Tab = createBottomTabNavigator();

export default function PatientBottomTabs() {
  const { t } = useTranslation();
  return (
    <Tab.Navigator screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: C.bg2, borderTopColor: C.border },
      tabBarActiveTintColor: C.mint,
      tabBarInactiveTintColor: C.text3,
    }}>
      <Tab.Screen
        name="Find Doctor"
        component={PatientStack}
        options={{
          tabBarLabel: t('tabs.findDoctor'),
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>🔍</Text>,
        }}
      />
      <Tab.Screen
        name="Appointments"
        component={MyAppointmentsScreen}
        options={{
          tabBarLabel: t('tabs.appointments'),
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>📅</Text>,
        }}
      />
    </Tab.Navigator>
  );
}
