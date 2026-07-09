import React from 'react';
import { View } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { useNavigation } from '@react-navigation/native';

import PatientDrawer              from './PatientDrawer';
import ConsultationSummaryScreen  from '../screens/patient/ConsultationSummaryScreen';
import WriteReviewScreen          from '../screens/patient/WriteReviewScreen';
import NotificationsScreen        from '../screens/shared/NotificationsScreen';
import ChatScreen                 from '../screens/shared/ChatScreen';
import VideoCallScreen            from '../screens/shared/VideoCallScreen';
import MedicalRecordsScreen       from '../screens/patient/MedicalRecordsScreen';
import ProfileScreen              from '../screens/patient/ProfileScreen';
import PatientSettingsScreen      from '../screens/patient/SettingsScreen';
import ChatbotScreen              from '../screens/patient/ChatbotScreen';
import ChatFloatingButton         from '../components/ChatFloatingButton';

const Stack = createStackNavigator();

/**
 * PatientHome wraps PatientDrawer and overlays the ChatFloatingButton FAB.
 * Placing the FAB here (at the PatientHome screen level) ensures it floats
 * above the drawer content on the default patient screen without being re-mounted
 * on every navigation event. useNavigation() gives access to the parent Stack
 * to navigate to 'Chatbot'.
 */
function PatientHomeWithFAB() {
  const navigation = useNavigation();
  return (
    <View style={{ flex: 1 }}>
      <PatientDrawer />
      <ChatFloatingButton onPress={() => navigation.navigate('Chatbot')} />
    </View>
  );
}

export default function PatientTabs() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PatientHome"         component={PatientHomeWithFAB} />
      <Stack.Screen name="Records"             component={MedicalRecordsScreen} />
      <Stack.Screen name="Profile"             component={ProfileScreen} />
      <Stack.Screen name="Settings"            component={PatientSettingsScreen} />
      <Stack.Screen name="Notifications"       component={NotificationsScreen} />
      <Stack.Screen name="ConsultationSummary" component={ConsultationSummaryScreen} />
      <Stack.Screen name="WriteReview"         component={WriteReviewScreen} />
      <Stack.Screen name="Chat"                component={ChatScreen} />
      <Stack.Screen name="VideoCall"           component={VideoCallScreen} />
      <Stack.Screen
        name="Chatbot"
        component={ChatbotScreen}
        options={{ presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}
