import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import FindDoctorScreen from '../screens/patient/FindDoctorScreen';
import DoctorProfileScreen from '../screens/patient/DoctorProfileScreen';
import BookAppointmentScreen from '../screens/patient/BookAppointmentScreen';
import BookConfirmedScreen from '../screens/patient/BookConfirmedScreen';
import SymptomInputScreen from '../screens/patient/SymptomInputScreen';

const Stack = createStackNavigator();

export default function PatientStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="FindDoctor" component={FindDoctorScreen} />
      <Stack.Screen name="DoctorProfile" component={DoctorProfileScreen} />
      <Stack.Screen name="BookAppointment" component={BookAppointmentScreen} />
      <Stack.Screen name="SymptomInput" component={SymptomInputScreen} />
      <Stack.Screen name="BookConfirmed" component={BookConfirmedScreen} />
    </Stack.Navigator>
  );
}
