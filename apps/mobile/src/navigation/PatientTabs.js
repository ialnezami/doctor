import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

import PatientDrawer              from './PatientDrawer';
import ConsultationSummaryScreen  from '../screens/patient/ConsultationSummaryScreen';
import WriteReviewScreen          from '../screens/patient/WriteReviewScreen';
import NotificationsScreen        from '../screens/shared/NotificationsScreen';
import ChatScreen                 from '../screens/shared/ChatScreen';
import VideoCallScreen            from '../screens/shared/VideoCallScreen';
import MedicalRecordsScreen       from '../screens/patient/MedicalRecordsScreen';
import ProfileScreen              from '../screens/patient/ProfileScreen';
import PatientSettingsScreen      from '../screens/patient/SettingsScreen';

const Stack = createStackNavigator();

export default function PatientTabs() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PatientHome"         component={PatientDrawer} />
      <Stack.Screen name="Records"             component={MedicalRecordsScreen} />
      <Stack.Screen name="Profile"             component={ProfileScreen} />
      <Stack.Screen name="Settings"            component={PatientSettingsScreen} />
      <Stack.Screen name="Notifications"       component={NotificationsScreen} />
      <Stack.Screen name="ConsultationSummary" component={ConsultationSummaryScreen} />
      <Stack.Screen name="WriteReview"         component={WriteReviewScreen} />
      <Stack.Screen name="Chat"                component={ChatScreen} />
      <Stack.Screen name="VideoCall"           component={VideoCallScreen} />
    </Stack.Navigator>
  );
}
