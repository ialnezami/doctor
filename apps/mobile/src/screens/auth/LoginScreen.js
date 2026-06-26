import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import C from '../../constants/colors';
import { login } from '../../api/auth';
import useAuthStore from '../../store/authStore';
import useGoogleSignIn from '../../hooks/useGoogleSignIn';

export default function LoginScreen({ navigation }) {
  const { t } = useTranslation();
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
      setError(e.message || t('auth.login.invalidCredentials'));
    } finally { setLoading(false); }
  };

  return (
    <ScrollView contentContainerStyle={s.container}>
      <View style={s.logo}><Text style={s.logoText}>M</Text></View>
      <Text style={s.headline}>MediConnect</Text>
      <Text style={s.sub}>{t('auth.appTagline')}</Text>

      <Text style={s.label}>{t('auth.email')}</Text>
      <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder={t('auth.emailPlaceholder')} placeholderTextColor={C.text3} keyboardType="email-address" autoCapitalize="none" />
      <Text style={s.label}>{t('auth.password')}</Text>
      <TextInput style={s.input} value={password} onChangeText={setPassword} placeholder={t('auth.passwordPlaceholder')} placeholderTextColor={C.text3} secureTextEntry />

      {!!error && <Text style={s.error}>{error}</Text>}

      <TouchableOpacity style={s.btn} onPress={submit} disabled={loading}>
        <Text style={s.btnText}>{loading ? t('auth.login.submitting') : t('auth.login.submit')}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate('Register')}>
        <Text style={s.link}>{t('auth.login.noAccount')} <Text style={{ color: C.mint }}>{t('auth.login.createOne')}</Text></Text>
      </TouchableOpacity>

      <View style={{ flexDirection:'row', alignItems:'center', marginTop:24, marginBottom:12, width:'100%' }}>
        <View style={{ flex:1, height:1, backgroundColor:C.border2 }} />
        <Text style={{ color:C.text3, fontSize:12, marginHorizontal:10 }}>{t('common.or')}</Text>
        <View style={{ flex:1, height:1, backgroundColor:C.border2 }} />
      </View>

      <TouchableOpacity
        style={[s.btn, { backgroundColor:'#fff', borderWidth:1, borderColor:C.border2 }]}
        onPress={googleSignIn}
        disabled={googleLoading}
      >
        <Text style={{ fontSize:15, fontWeight:'700', color:'#333' }}>
          {googleLoading ? t('auth.login.submitting') : `G  ${t('auth.login.googleSignIn')}`}
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
  label: { alignSelf:'flex-start', fontSize:11, fontWeight:'600', textTransform:'uppercase', letterSpacing:0.7, color:C.text2, marginBottom:6 },
  input: { width:'100%', backgroundColor:C.bg3, borderWidth:1, borderColor:C.border2, borderRadius:8, padding:12, color:C.text, fontSize:14, marginBottom:14 },
  btn: { width:'100%', backgroundColor:C.mint, borderRadius:8, padding:14, alignItems:'center', marginTop:6 },
  btnText: { fontSize:15, fontWeight:'700', color:'#000' },
  error: { color:C.rose, fontSize:13, marginBottom:10 },
  link: { fontSize:13, color:C.text2, marginTop:20 },
});
