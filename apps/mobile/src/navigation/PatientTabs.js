import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Text } from 'react-native';
import C from '../constants/colors';

import FindDoctorScreen           from '../screens/patient/FindDoctorScreen';
import MyAppointmentsScreen       from '../screens/patient/MyAppointmentsScreen';
import MedicalRecordsScreen       from '../screens/patient/MedicalRecordsScreen';
import LabResultsScreen           from '../screens/patient/LabResultsScreen';
import ConsultationSummaryScreen  from '../screens/patient/ConsultationSummaryScreen';
import NotificationsScreen        from '../screens/shared/NotificationsScreen';

const Tab   = createBottomTabNavigator();
const Stack = createStackNavigator();

function PatientBottomTabs() {
  return (
    <Tab.Navigator screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: C.bg2, borderTopColor: C.border },
      tabBarActiveTintColor: C.mint,
      tabBarInactiveTintColor: C.text3,
    }}>
      <Tab.Screen name="Find Doctor"    component={FindDoctorScreen}     options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>🔍</Text> }} />
      <Tab.Screen name="Appointments"   component={MyAppointmentsScreen} options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>📅</Text> }} />
      <Tab.Screen name="Records"        component={MedicalRecordsScreen} options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>📋</Text> }} />
      <Tab.Screen name="Lab Results"    component={LabResultsScreen}     options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>🧪</Text> }} />
      <Tab.Screen name="Notifications"  component={NotificationsScreen}  options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>🔔</Text> }} />
    </Tab.Navigator>
  );
}

export default function PatientTabs() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PatientHome"          component={PatientBottomTabs} />
      <Stack.Screen name="ConsultationSummary"  component={ConsultationSummaryScreen} />
    </Stack.Navigator>
  );
}
