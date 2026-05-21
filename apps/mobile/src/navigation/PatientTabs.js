import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import C from '../constants/colors';
import PatientStack from './PatientStack';
import MyAppointmentsScreen from '../screens/patient/MyAppointmentsScreen';
import MedicalRecordsScreen from '../screens/patient/MedicalRecordsScreen';
import LabResultsScreen from '../screens/patient/LabResultsScreen';
import ProfileScreen from '../screens/patient/ProfileScreen';

const Tab = createBottomTabNavigator();

export default function PatientTabs() {
  const { t } = useTranslation();
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarStyle: { backgroundColor: C.bg2, borderTopColor: C.border }, tabBarActiveTintColor: C.mint, tabBarInactiveTintColor: C.text3 }}>
      <Tab.Screen name="Find Doctor"  component={PatientStack}          options={{ tabBarLabel: t('tabs.findDoctor'),    tabBarIcon: () => <Text style={{ fontSize: 20 }}>🔍</Text> }} />
      <Tab.Screen name="Appointments" component={MyAppointmentsScreen}  options={{ tabBarLabel: t('tabs.appointments'), tabBarIcon: () => <Text style={{ fontSize: 20 }}>📅</Text> }} />
      <Tab.Screen name="Records"      component={MedicalRecordsScreen}  options={{ tabBarLabel: t('tabs.records'),       tabBarIcon: () => <Text style={{ fontSize: 20 }}>📋</Text> }} />
      <Tab.Screen name="Lab Results"  component={LabResultsScreen}      options={{ tabBarLabel: t('tabs.labResults'),   tabBarIcon: () => <Text style={{ fontSize: 20 }}>🧪</Text> }} />
      <Tab.Screen name="Profile"      component={ProfileScreen}         options={{ tabBarLabel: t('tabs.profile'),      tabBarIcon: () => <Text style={{ fontSize: 20 }}>👤</Text> }} />
    </Tab.Navigator>
  );
}
