import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import './src/i18n';
import { getSavedLanguage, applyRTL } from './src/i18n';
import i18n from './src/i18n';
import useLangStore from './src/store/langStore';
import AppNavigator from './src/navigation/AppNavigator';

function App() {
  const [ready, setReady] = useState(false);
  const setLang = useLangStore(s => s.setLang);

  useEffect(() => {
    getSavedLanguage().then(lang => {
      i18n.changeLanguage(lang);
      applyRTL(lang);
      setLang(lang);
      setReady(true);
    });
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: '#060d18', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#0fe3b0" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <AppNavigator />
    </>
  );
}

registerRootComponent(App);
