import React, { useEffect, useState } from 'react';
import { I18nManager } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useAuthStore from '../store/authStore';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import DoctorTabs from './DoctorTabs';
import PatientTabs from './PatientTabs';
import LabTabs      from './LabTabs';
import PharmacyTabs from './PharmacyTabs';
import Onboarding from '../screens/Onboarding';

const Root = createStackNavigator();

export default function AppNavigator() {
  const { user } = useAuthStore();
  const [onboarded, setOnboarded] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('onboarded').then(v => setOnboarded(!!v));
  }, []);

  useEffect(() => {
    if (user?.role === 'doctor' && !I18nManager.isRTL) {
      I18nManager.forceRTL(true);
    }
  }, [user?.role]);

  if (onboarded === null) return null;
  if (!onboarded) return <Onboarding onDone={() => setOnboarded(true)} />;

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
        ) : user.role === 'laboratory' ? (
          <Root.Screen name="LabTabs" component={LabTabs} />
        ) : user.role === 'pharmacy' ? (
          <Root.Screen name="PharmacyTabs" component={PharmacyTabs} />
        ) : (
          <Root.Screen name="PatientTabs" component={PatientTabs} />
        )}
      </Root.Navigator>
    </NavigationContainer>
  );
}
