import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { submitSymptoms } from '../../api/appointments';
import C from '../../constants/colors';

const MAX = 1000;

export default function SymptomInputScreen({ route, navigation }) {
  const { appointmentId, status } = route.params;
  const [text, setText]       = useState('');
  const [loading, setLoading] = useState(false);

  const proceed = async () => {
    if (text.trim().length > 0) {
      setLoading(true);
      try {
        await submitSymptoms(appointmentId, text.trim());
      } catch (_) {
        // silent — booking already succeeded
      } finally { setLoading(false); }
    }
    navigation.replace('BookConfirmed', { status });
  };

  const skip = () => navigation.replace('BookConfirmed', { status });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <TouchableOpacity onPress={skip} style={{ marginBottom: 16 }}>
          <Text style={{ color: C.mint, fontSize: 14 }}>← Skip</Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 6 }}>
          Describe your symptoms
        </Text>
        <Text style={{ fontSize: 14, color: C.text2, marginBottom: 20 }}>
          Optional — helps your doctor prepare for the visit.
        </Text>

        <TextInput
          multiline
          value={text}
          onChangeText={t => setText(t.slice(0, MAX))}
          placeholder="e.g. I've had a sore throat and fever for 3 days…"
          placeholderTextColor={C.text3}
          style={{
            backgroundColor: C.bg2, borderColor: C.border, borderWidth: 1,
            borderRadius: 8, padding: 12, color: C.text, fontSize: 14,
            minHeight: 140, textAlignVertical: 'top',
          }}
        />
        <Text style={{ fontSize: 12, color: C.text2, textAlign: 'right', marginTop: 4 }}>
          {text.length} / {MAX}
        </Text>

        <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
          <TouchableOpacity
            onPress={skip}
            style={{ flex: 1, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: C.border, alignItems: 'center' }}
          >
            <Text style={{ color: C.text2, fontWeight: '600' }}>Skip</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={proceed}
            disabled={loading}
            style={{ flex: 1, padding: 14, borderRadius: 8, backgroundColor: C.mint, alignItems: 'center' }}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: '#fff', fontWeight: '600' }}>Continue</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
