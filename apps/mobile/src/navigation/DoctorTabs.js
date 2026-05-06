import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import C from '../constants/colors';
import DashboardScreen from '../screens/doctor/DashboardScreen';
import AppointmentsScreen from '../screens/doctor/AppointmentsScreen';

const Tab = createBottomTabNavigator();
const icon = (label, focused) => <Text style={{ fontSize: 20 }}>{label}</Text>;

export default function DoctorTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarStyle: { backgroundColor: C.bg2, borderTopColor: C.border }, tabBarActiveTintColor: C.mint, tabBarInactiveTintColor: C.text3 }}>
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ tabBarIcon: ({ focused }) => icon('🏠', focused) }} />
      <Tab.Screen name="Appointments" component={AppointmentsScreen} options={{ tabBarIcon: ({ focused }) => icon('📅', focused) }} />
    </Tab.Navigator>
  );
}
