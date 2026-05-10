import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import AppNavigator from './src/navigation/AppNavigator';

function App() {
  return (
    <>
      <StatusBar style="light" />
      <AppNavigator />
    </>
  );
}

registerRootComponent(App);
