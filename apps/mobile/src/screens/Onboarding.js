import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import C from '../constants/colors';

const STEPS = [
  { icon: '🩺', title: 'Find Doctors Near You', body: 'Search by specialty or location and book an appointment in seconds.' },
  { icon: '📋', title: 'Manage Your Health Records', body: 'Access prescriptions, lab results, and medical notes all in one place.' },
  { icon: '🔒', title: 'Private & Secure', body: 'Your data is encrypted and only shared with your care team.' },
];

export default function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);

  const finish = async () => {
    await AsyncStorage.setItem('onboarded', '1');
    onDone();
  };

  const s = STEPS[step];
  return (
    <SafeAreaView style={st.safe}>
      <View style={st.content}>
        <Text style={st.icon}>{s.icon}</Text>
        <Text style={st.title}>{s.title}</Text>
        <Text style={st.body}>{s.body}</Text>

        <View style={st.dots}>
          {STEPS.map((_, i) => (
            <View key={i} style={[st.dot, i === step && st.dotActive]} />
          ))}
        </View>
      </View>

      <View style={st.footer}>
        {step < STEPS.length - 1 ? (
          <>
            <TouchableOpacity onPress={finish}>
              <Text style={st.skip}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.btn} onPress={() => setStep(n => n + 1)}>
              <Text style={st.btnTxt}>Next →</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={[st.btn, { flex: 1 }]} onPress={finish}>
            <Text style={st.btnTxt}>Get Started</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: C.bg },
  content:   { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  icon:      { fontSize: 72, marginBottom: 24 },
  title:     { fontSize: 24, fontWeight: '700', color: C.text, textAlign: 'center', marginBottom: 14 },
  body:      { fontSize: 15, color: C.text2, textAlign: 'center', lineHeight: 23 },
  dots:      { flexDirection: 'row', gap: 8, marginTop: 36 },
  dot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border },
  dotActive: { backgroundColor: C.mint, width: 20 },
  footer:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, gap: 12 },
  skip:      { fontSize: 14, color: C.text2 },
  btn:       { backgroundColor: C.mint, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 14 },
  btnTxt:    { fontSize: 15, fontWeight: '700', color: '#000' },
});
