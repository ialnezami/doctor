import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Text } from 'react-native';
import C from '../constants/colors';

import DashboardScreen         from '../screens/doctor/DashboardScreen';
import AppointmentsScreen      from '../screens/doctor/AppointmentsScreen';
import AppointmentDetailScreen from '../screens/doctor/AppointmentDetailScreen';
import NoteEditorScreen        from '../screens/doctor/NoteEditorScreen';
import DoctorLabResultsScreen  from '../screens/doctor/LabResultsScreen';
import NotificationsScreen     from '../screens/shared/NotificationsScreen';

const Tab   = createBottomTabNavigator();
const Stack = createStackNavigator();

function DoctorBottomTabs() {
  return (
    <Tab.Navigator screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: C.bg2, borderTopColor: C.border },
      tabBarActiveTintColor: C.mint,
      tabBarInactiveTintColor: C.text3,
    }}>
      <Tab.Screen name="Dashboard"    component={DashboardScreen}        options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>🏠</Text> }} />
      <Tab.Screen name="Appointments" component={AppointmentsScreen}     options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>📅</Text> }} />
      <Tab.Screen name="Lab Results"  component={DoctorLabResultsScreen} options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>🔬</Text> }} />
      <Tab.Screen name="Notifications" component={NotificationsScreen}   options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>🔔</Text> }} />
    </Tab.Navigator>
  );
}

export default function DoctorTabs() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DoctorHome"         component={DoctorBottomTabs} />
      <Stack.Screen name="AppointmentDetail"  component={AppointmentDetailScreen} />
      <Stack.Screen name="NoteEditor"         component={NoteEditorScreen} />
    </Stack.Navigator>
  );
}
