import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Text } from 'react-native';

import TodayScreen             from '../screens/doctor/TodayScreen';
import AppointmentsScreen      from '../screens/doctor/AppointmentsScreen';
import AppointmentDetailScreen from '../screens/doctor/AppointmentDetailScreen';
import NoteEditorScreen        from '../screens/doctor/NoteEditorScreen';
import ReviewsScreen           from '../screens/doctor/ReviewsScreen';
import SettingsScreen          from '../screens/doctor/SettingsScreen';
import ChatScreen              from '../screens/shared/ChatScreen';
import VideoCallScreen         from '../screens/shared/VideoCallScreen';

const TEAL = '#0d9488';
const Tab   = createBottomTabNavigator();
const Stack = createStackNavigator();

function TabIcon({ emoji, focused }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>{emoji}</Text>;
}

function DoctorBottomTabs() {
  return (
    <Tab.Navigator screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: TEAL,
      tabBarInactiveTintColor: '#8aa5b8',
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      tabBarStyle: { borderTopColor: '#d0dce8' },
    }}>
      <Tab.Screen name="Today"        component={TodayScreen}        options={{ tabBarLabel: 'اليوم',     tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} /> }} />
      <Tab.Screen name="Appointments" component={AppointmentsScreen} options={{ tabBarLabel: 'المواعيد', tabBarIcon: ({ focused }) => <TabIcon emoji="📅" focused={focused} /> }} />
      <Tab.Screen name="Settings"     component={SettingsScreen}     options={{ tabBarLabel: 'الإعدادات', tabBarIcon: ({ focused }) => <TabIcon emoji="⚙️" focused={focused} /> }} />
    </Tab.Navigator>
  );
}

export default function DoctorTabs() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DoctorHome"        component={DoctorBottomTabs} />
      <Stack.Screen name="AppointmentDetail" component={AppointmentDetailScreen} />
      <Stack.Screen name="NoteEditor"        component={NoteEditorScreen} />
      <Stack.Screen name="Reviews"           component={ReviewsScreen} />
      <Stack.Screen name="Chat"              component={ChatScreen} />
      <Stack.Screen name="VideoCall"         component={VideoCallScreen} />
    </Stack.Navigator>
  );
}
