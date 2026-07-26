import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import C from '../../constants/colors';

const SPECIALTIES = [
  { key: 'general',            en: 'General Medicine' },
  { key: 'dentistry',          en: 'Dentistry' },
  { key: 'ophthalmology',      en: 'Ophthalmology' },
  { key: 'pediatrics',         en: 'Pediatrics' },
  { key: 'obstetrics',         en: 'OB/GYN' },
  { key: 'internal_medicine',  en: 'Internal Medicine' },
  { key: 'ent',                en: 'ENT' },
  { key: 'cardiology',         en: 'Cardiology' },
  { key: 'orthopedics',        en: 'Orthopedics' },
  { key: 'general_surgery',    en: 'General Surgery' },
  { key: 'psychiatry',         en: 'Psychiatry' },
  { key: 'dermatology',        en: 'Dermatology' },
  { key: 'aesthetics',         en: 'Aesthetics' },
  { key: 'neurology',          en: 'Neurology' },
  { key: 'vascular',           en: 'Vascular' },
  { key: 'oncology',           en: 'Oncology' },
  { key: 'nutrition',          en: 'Nutrition' },
  { key: 'endocrinology',      en: 'Endocrinology & Diabetes' },
  { key: 'urology',            en: 'Urology' },
  { key: 'gastroenterology',   en: 'Gastroenterology' },
  { key: 'physical_therapy',   en: 'Physical Therapy' },
  { key: 'thoracic_surgery',   en: 'Thoracic Surgery' },
  { key: 'neurosurgery',       en: 'Neurosurgery' },
  { key: 'orthopedic_surgery', en: 'Orthopedic Surgery' },
  { key: 'vascular_surgery',   en: 'Vascular Surgery' },
];
import { register } from '../../api/auth';
import useAuthStore from '../../store/authStore';
import useGoogleSignIn from '../../hooks/useGoogleSignIn';

export default function RegisterScreen({ navigation }) {
  const setAuth = useAuthStore(s => s.login);
  const [form, setForm] = useState({ name:'', email:'', password:'', role:'patient', specialty:'', labName:'' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const { signIn: googleSignIn, loading: googleLoading, error: googleError } = useGoogleSignIn();

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
        {[['patient','🧑 Patient'],['doctor','👨‍⚕️ Doctor'],['laboratory','🧪 Lab']].map(([r, label]) => (
          <TouchableOpacity key={r} style={[s.tBtn, form.role===r && s.tActive]} onPress={() => set('role', r)}>
            <Text style={[s.tLabel, form.role===r && s.tLabelActive]}>{label}</Text>
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
          <View style={[s.input, { padding:0 }]}>
            <Picker selectedValue={form.specialty} onValueChange={v => set('specialty', v)}
              style={{ color: C.text }} dropdownIconColor={C.text3}>
              <Picker.Item label="Select specialty" value="" color={C.text3} />
              {SPECIALTIES.map(sp => <Picker.Item key={sp.key} label={sp.en} value={sp.en} color={C.text} />)}
            </Picker>
          </View>
        </View>
      )}
      {form.role === 'laboratory' && (
        <View style={{ width:'100%', marginBottom:14 }}>
          <Text style={s.label}>Lab Name</Text>
          <TextInput style={s.input} value={form.labName} onChangeText={v => set('labName',v)}
            placeholder="e.g. City Diagnostics Lab" placeholderTextColor={C.text3} />
        </View>
      )}
      {!!error && <Text style={{ color:C.rose, fontSize:13, marginBottom:10 }}>{error}</Text>}
      <TouchableOpacity style={s.btn} onPress={submit} disabled={loading}>
        <Text style={s.btnText}>{loading ? 'Creating…' : 'Create account'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate('Login')}>
        <Text style={{ fontSize:13, color:C.text2, marginTop:20 }}>Have an account? <Text style={{ color:C.mint }}>Sign in</Text></Text>
      </TouchableOpacity>

      {/* divider */}
      <View style={{ flexDirection:'row', alignItems:'center', marginTop:24, marginBottom:12, width:'100%' }}>
        <View style={{ flex:1, height:1, backgroundColor:C.border2 }} />
        <Text style={{ color:C.text3, fontSize:12, marginHorizontal:10 }}>or</Text>
        <View style={{ flex:1, height:1, backgroundColor:C.border2 }} />
      </View>

      <TouchableOpacity
        style={[s.btn, { backgroundColor:'#fff', borderWidth:1, borderColor:C.border2 }]}
        onPress={googleSignIn}
        disabled={googleLoading}
      >
        <Text style={{ fontSize:15, fontWeight:'700', color:'#333' }}>
          {googleLoading ? 'Creating account…' : 'G  Sign up with Google'}
        </Text>
      </TouchableOpacity>
      <Text style={{ color:C.text3, fontSize:11, marginTop:8, textAlign:'center' }}>
        Google sign-up creates a patient account
      </Text>
      {!!googleError && <Text style={{ color:C.rose, fontSize:13, marginTop:6 }}>{googleError}</Text>}
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
