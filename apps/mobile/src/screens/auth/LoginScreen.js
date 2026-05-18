import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import C from '../../constants/colors';
import { login } from '../../api/auth';
import useAuthStore from '../../store/authStore';
import useGoogleSignIn from '../../hooks/useGoogleSignIn';

export default function LoginScreen({ navigation }) {
  const setAuth = useAuthStore(s => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn: googleSignIn, loading: googleLoading, error: googleError } = useGoogleSignIn();

  const submit = async () => {
    setLoading(true); setError('');
    try {
      const { token, user } = await login({ email, password });
      setAuth(user, token);
    } catch (e) {
      setError(e.message || 'Invalid credentials');
    } finally { setLoading(false); }
  };

  return (
    <ScrollView contentContainerStyle={s.container}>
      <View style={s.logo}><Text style={s.logoText}>M</Text></View>
      <Text style={s.headline}>MediConnect</Text>
      <Text style={s.sub}>Healthcare reimagined</Text>

      <View style={s.roles}>
        <Text style={s.rolesTxt}>🧑‍🤝‍🧑 Patient  ·  👨‍⚕️ Doctor  ·  🧪 Lab</Text>
      </View>

      <Text style={s.label}>Email</Text>
      <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="Enter email" placeholderTextColor={C.text3} keyboardType="email-address" autoCapitalize="none" />
      <Text style={s.label}>Password</Text>
      <TextInput style={s.input} value={password} onChangeText={setPassword} placeholder="Enter password" placeholderTextColor={C.text3} secureTextEntry />

      {!!error && <Text style={s.error}>{error}</Text>}

      <TouchableOpacity style={s.btn} onPress={submit} disabled={loading}>
        <Text style={s.btnText}>{loading ? 'Signing in…' : 'Sign in'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate('Register')}>
        <Text style={s.link}>No account? <Text style={{ color: C.mint }}>Create one free</Text></Text>
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
          {googleLoading ? 'Signing in…' : 'G  Sign in with Google'}
        </Text>
      </TouchableOpacity>
      {!!googleError && <Text style={[s.error, { marginTop:8 }]}>{googleError}</Text>}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flexGrow:1, backgroundColor:C.bg, alignItems:'center', justifyContent:'center', padding:32 },
  logo: { width:60, height:60, backgroundColor:C.mint, borderRadius:18, alignItems:'center', justifyContent:'center', marginBottom:14 },
  logoText: { fontSize:28, fontWeight:'800', color:'#000' },
  headline: { fontSize:28, fontWeight:'700', color:C.text, marginBottom:4 },
  sub: { fontSize:14, color:C.text2, marginBottom:32 },
  roles: { marginBottom:24 },
  rolesTxt: { fontSize:13, color:C.text3 },
  label: { alignSelf:'flex-start', fontSize:11, fontWeight:'600', textTransform:'uppercase', letterSpacing:0.7, color:C.text2, marginBottom:6 },
  input: { width:'100%', backgroundColor:C.bg3, borderWidth:1, borderColor:C.border2, borderRadius:8, padding:12, color:C.text, fontSize:14, marginBottom:14 },
  btn: { width:'100%', backgroundColor:C.mint, borderRadius:8, padding:14, alignItems:'center', marginTop:6 },
  btnText: { fontSize:15, fontWeight:'700', color:'#000' },
  error: { color:C.rose, fontSize:13, marginBottom:10 },
  link: { fontSize:13, color:C.text2, marginTop:20 },
});
