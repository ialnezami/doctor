import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import C from '../../constants/colors';
import { register } from '../../api/auth';
import useAuthStore from '../../store/authStore';

export default function RegisterScreen({ navigation }) {
  const setAuth = useAuthStore(s => s.login);
  const [form, setForm] = useState({ name:'', email:'', password:'', role:'patient', specialty:'' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const submit = async () => {
    setLoading(true); setError('');
    try { const { token, user } = await register(form); setAuth(user, token); }
    catch (e) { setError(e.message || 'Registration failed'); }
    finally { setLoading(false); }
  };

  return (
    <ScrollView contentContainerStyle={s.container}>
      <Text style={s.title}>Create account</Text>
      <View style={s.toggle}>
        {['patient','doctor'].map(r => (
          <TouchableOpacity key={r} style={[s.tBtn, form.role===r && s.tActive]} onPress={() => set('role', r)}>
            <Text style={[s.tLabel, form.role===r && s.tLabelActive]}>{r === 'patient' ? '🧑 Patient' : '👨‍⚕️ Doctor'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {[['name','Full Name','text'],['email','Email','email-address'],['password','Password','default']].map(([k,l,kb]) => (
        <View key={k} style={{ width:'100%', marginBottom:14 }}>
          <Text style={s.label}>{l}</Text>
          <TextInput style={s.input} value={form[k]} onChangeText={v => set(k,v)} placeholderTextColor={C.text3} placeholder={l} keyboardType={kb} secureTextEntry={k==='password'} autoCapitalize="none" />
        </View>
      ))}
      {form.role === 'doctor' && (
        <View style={{ width:'100%', marginBottom:14 }}>
          <Text style={s.label}>Specialty</Text>
          <TextInput style={s.input} value={form.specialty} onChangeText={v => set('specialty',v)} placeholder="e.g. Cardiology" placeholderTextColor={C.text3} />
        </View>
      )}
      {!!error && <Text style={{ color:C.rose, fontSize:13, marginBottom:10 }}>{error}</Text>}
      <TouchableOpacity style={s.btn} onPress={submit} disabled={loading}>
        <Text style={s.btnText}>{loading ? 'Creating…' : 'Create account'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate('Login')}>
        <Text style={{ fontSize:13, color:C.text2, marginTop:20 }}>Have an account? <Text style={{ color:C.mint }}>Sign in</Text></Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flexGrow:1, backgroundColor:C.bg, alignItems:'center', justifyContent:'center', padding:32 },
  title: { fontSize:26, fontWeight:'700', color:C.text, marginBottom:24 },
  toggle: { flexDirection:'row', backgroundColor:C.bg2, borderRadius:10, padding:3, marginBottom:20, borderWidth:1, borderColor:C.border, width:'100%' },
  tBtn: { flex:1, padding:10, borderRadius:8, alignItems:'center' },
  tActive: { backgroundColor:C.bg3, borderWidth:1, borderColor:C.border2 },
  tLabel: { fontSize:13, color:C.text2, fontWeight:'500' },
  tLabelActive: { color:C.mint, fontWeight:'700' },
  label: { fontSize:11, fontWeight:'600', textTransform:'uppercase', letterSpacing:0.7, color:C.text2, marginBottom:6 },
  input: { width:'100%', backgroundColor:C.bg3, borderWidth:1, borderColor:C.border2, borderRadius:8, padding:12, color:C.text, fontSize:14 },
  btn: { width:'100%', backgroundColor:C.mint, borderRadius:8, padding:14, alignItems:'center', marginTop:6 },
  btnText: { fontSize:15, fontWeight:'700', color:'#000' },
});
