import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import useAuthStore from '../store/authStore';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import DoctorTabs from './DoctorTabs';
import PatientTabs from './PatientTabs';

const Root = createStackNavigator();

export default function AppNavigator() {
  const { user } = useAuthStore();
  return (
    <NavigationContainer>
      <Root.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <>
            <Root.Screen name="Login" component={LoginScreen} />
            <Root.Screen name="Register" component={RegisterScreen} />
          </>
        ) : user.role === 'doctor' ? (
          <Root.Screen name="DoctorTabs" component={DoctorTabs} />
        ) : (
          <Root.Screen name="PatientTabs" component={PatientTabs} />
        )}
      </Root.Navigator>
    </NavigationContainer>
  );
}
