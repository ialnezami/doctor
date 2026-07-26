import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import C from '../constants/colors';
import PharmacyPOSScreen       from '../screens/pharmacy/PharmacyPOSScreen';
import PharmacyInventoryScreen from '../screens/pharmacy/PharmacyInventoryScreen';
import PharmacyProfileScreen   from '../screens/pharmacy/PharmacyProfileScreen';

const Tab = createBottomTabNavigator();

export default function PharmacyTabs() {
  return (
    <Tab.Navigator screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: C.bg2, borderTopColor: C.border },
      tabBarActiveTintColor:   C.mint,
      tabBarInactiveTintColor: C.text3,
    }}>
      <Tab.Screen name="POS"       component={PharmacyPOSScreen}       options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>💊</Text> }} />
      <Tab.Screen name="Inventory" component={PharmacyInventoryScreen} options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>📦</Text> }} />
      <Tab.Screen name="Profile"   component={PharmacyProfileScreen}   options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>👤</Text> }} />
    </Tab.Navigator>
  );
}
