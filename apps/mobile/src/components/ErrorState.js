import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import C from '../constants/colors';

export default function ErrorState({ icon = '🔍', title, message, action, onAction }) {
  return (
    <View style={s.container}>
      <Text style={s.icon}>{icon}</Text>
      <Text style={s.title}>{title}</Text>
      {message ? <Text style={s.message}>{message}</Text> : null}
      {action && onAction ? (
        <TouchableOpacity style={s.btn} onPress={onAction}>
          <Text style={s.btnTxt}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  icon:      { fontSize: 52, marginBottom: 16 },
  title:     { fontSize: 17, fontWeight: '700', color: C.text, textAlign: 'center', marginBottom: 8 },
  message:   { fontSize: 13, color: C.text2, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  btn:       { backgroundColor: C.mint, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 11 },
  btnTxt:    { fontSize: 14, fontWeight: '700', color: '#000' },
});
