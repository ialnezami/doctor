import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import C from '../../constants/colors';

export default function BookConfirmedScreen({ route, navigation }) {
  const { status } = route.params;
  const confirmed = status === 'confirmed';

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.content}>
        <Text style={s.icon}>{confirmed ? '✅' : '⏳'}</Text>
        <Text style={s.title}>{confirmed ? 'Appointment Confirmed!' : 'Request Sent'}</Text>
        <Text style={s.body}>
          {confirmed
            ? 'Your appointment has been confirmed. You will receive a reminder before the visit.'
            : 'Your request is pending doctor approval. You will be notified once it is confirmed.'}
        </Text>
        <TouchableOpacity style={s.btn} onPress={() => navigation.navigate('Appointments')}>
          <Text style={s.btnTxt}>View My Appointments</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex:1, backgroundColor:C.bg },
  content: { flex:1, justifyContent:'center', alignItems:'center', padding:32 },
  icon: { fontSize:64, marginBottom:20 },
  title: { fontSize:22, fontWeight:'700', color:C.text, marginBottom:12, textAlign:'center' },
  body: { fontSize:14, color:C.text2, textAlign:'center', lineHeight:22, marginBottom:32 },
  btn: { backgroundColor:C.mint, borderRadius:12, paddingHorizontal:28, paddingVertical:14 },
  btnTxt: { fontSize:15, fontWeight:'700', color:'#000' },
});
