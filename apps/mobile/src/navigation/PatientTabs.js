import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import C from '../constants/colors';

import PatientStack              from './PatientStack';
import MyAppointmentsScreen      from '../screens/patient/MyAppointmentsScreen';
import MedicalRecordsScreen      from '../screens/patient/MedicalRecordsScreen';
import LabResultsScreen          from '../screens/patient/LabResultsScreen';
import ProfileScreen             from '../screens/patient/ProfileScreen';
import ConsultationSummaryScreen from '../screens/patient/ConsultationSummaryScreen';
import WriteReviewScreen         from '../screens/patient/WriteReviewScreen';
import NotificationsScreen       from '../screens/shared/NotificationsScreen';
import ChatScreen                from '../screens/shared/ChatScreen';
import VideoCallScreen           from '../screens/shared/VideoCallScreen';

const Tab   = createBottomTabNavigator();
const Stack = createStackNavigator();

function PatientBottomTabs() {
  const { t } = useTranslation();
  return (
    <Tab.Navigator screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: C.bg2, borderTopColor: C.border },
      tabBarActiveTintColor: C.mint,
      tabBarInactiveTintColor: C.text3,
    }}>
      <Tab.Screen name="Find Doctor"   component={PatientStack}         options={{ tabBarLabel: t('tabs.findDoctor'),    tabBarIcon: () => <Text style={{ fontSize: 20 }}>🔍</Text> }} />
      <Tab.Screen name="Appointments"  component={MyAppointmentsScreen} options={{ tabBarLabel: t('tabs.appointments'), tabBarIcon: () => <Text style={{ fontSize: 20 }}>📅</Text> }} />
      <Tab.Screen name="Records"       component={MedicalRecordsScreen} options={{ tabBarLabel: t('tabs.records'),       tabBarIcon: () => <Text style={{ fontSize: 20 }}>📋</Text> }} />
      <Tab.Screen name="Notifications" component={NotificationsScreen}  options={{ tabBarLabel: t('tabs.notifications'), tabBarIcon: () => <Text style={{ fontSize: 20 }}>🔔</Text> }} />
      <Tab.Screen name="Profile"       component={ProfileScreen}        options={{ tabBarLabel: t('tabs.profile'),      tabBarIcon: () => <Text style={{ fontSize: 20 }}>👤</Text> }} />
    </Tab.Navigator>
  );
}

export default function PatientTabs() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PatientHome"         component={PatientBottomTabs} />
      <Stack.Screen name="ConsultationSummary" component={ConsultationSummaryScreen} />
      <Stack.Screen name="WriteReview"         component={WriteReviewScreen} />
      <Stack.Screen name="Chat"                component={ChatScreen} />
      <Stack.Screen name="VideoCall"           component={VideoCallScreen} />
    </Stack.Navigator>
  );
}
