import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import C from '../constants/colors';
import LabUploadsScreen from '../screens/lab/LabUploadsScreen';

const Tab = createBottomTabNavigator();

export default function LabTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarStyle: { backgroundColor: C.bg2, borderTopColor: C.border }, tabBarActiveTintColor: C.mint, tabBarInactiveTintColor: C.text3 }}>
      <Tab.Screen name="My Uploads" component={LabUploadsScreen} options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>🧪</Text> }} />
    </Tab.Navigator>
  );
}
