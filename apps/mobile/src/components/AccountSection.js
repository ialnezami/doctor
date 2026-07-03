import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { updateMe, changePassword } from '../api/auth';
import useAuthStore from '../store/authStore';
import C from '../constants/colors';

export default function AccountSection({ user, hideLogout = false }) {
  const { logout, updateUser } = useAuthStore();

  const [name, setName] = useState(user?.name ?? '');
  const [savingName, setSavingName] = useState(false);

  const [pwOpen, setPwOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  const handleSaveName = async () => {
    if (!name.trim()) return Alert.alert('Name cannot be empty');
    setSavingName(true);
    try {
      const updated = await updateMe({ name: name.trim() });
      updateUser({ name: updated.name });
      Alert.alert('Saved', 'Name updated.');
    } catch (err) {
      Alert.alert('Error', err?.message ?? 'Could not update name');
    } finally { setSavingName(false); }
  };

  const handleChangePassword = async () => {
    if (newPw.length < 8) return Alert.alert('Validation', 'New password must be at least 8 characters.');
    if (newPw !== confirmPw) return Alert.alert('Validation', 'Passwords do not match.');
    setSavingPw(true);
    try {
      await changePassword({ currentPassword: currentPw, newPassword: newPw });
      Alert.alert('Success', 'Password changed. Please log in again.');
      logout();
    } catch (err) {
      Alert.alert('Error', err?.message ?? 'Could not change password');
    } finally { setSavingPw(false); }
  };

  return (
    <View>
      <Text style={s.sectionLabel}>Account</Text>
      <View style={s.card}>
        <Text style={s.fieldLabel}>Name</Text>
        <View style={s.row}>
          <TextInput
            style={[s.input, { flex: 1, marginRight: 8 }]}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={C.text3}
          />
          <TouchableOpacity style={s.saveBtn} onPress={handleSaveName} disabled={savingName}>
            {savingName
              ? <ActivityIndicator size="small" color="#000" />
              : <Text style={s.saveBtnTxt}>Save</Text>}
          </TouchableOpacity>
        </View>

        <Text style={[s.fieldLabel, { marginTop: 14 }]}>Email</Text>
        <Text style={s.emailText}>{user?.email}</Text>
      </View>

      <TouchableOpacity style={s.linkRow} onPress={() => setPwOpen(o => !o)}>
        <Text style={s.linkTxt}>Change Password</Text>
        <Text style={s.chevron}>{pwOpen ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {pwOpen && (
        <View style={s.card}>
          <TextInput
            style={s.input}
            placeholder="Current password"
            placeholderTextColor={C.text3}
            secureTextEntry
            value={currentPw}
            onChangeText={setCurrentPw}
          />
          <TextInput
            style={[s.input, { marginTop: 10 }]}
            placeholder="New password (min 8 chars)"
            placeholderTextColor={C.text3}
            secureTextEntry
            value={newPw}
            onChangeText={setNewPw}
          />
          <TextInput
            style={[s.input, { marginTop: 10 }]}
            placeholder="Confirm new password"
            placeholderTextColor={C.text3}
            secureTextEntry
            value={confirmPw}
            onChangeText={setConfirmPw}
          />
          <TouchableOpacity
            style={[s.saveBtn, { marginTop: 14, alignSelf: 'flex-start' }]}
            onPress={handleChangePassword}
            disabled={savingPw}
          >
            {savingPw
              ? <ActivityIndicator size="small" color="#000" />
              : <Text style={s.saveBtnTxt}>Update Password</Text>}
          </TouchableOpacity>
        </View>
      )}

      {!hideLogout && (
        <TouchableOpacity style={s.logoutBtn} onPress={logout}>
          <Text style={s.logoutTxt}>Log Out</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: '700', color: C.text3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  card:         { backgroundColor: C.bg2, borderRadius: 12, padding: 16, marginBottom: 12 },
  row:          { flexDirection: 'row', alignItems: 'center' },
  fieldLabel:   { fontSize: 12, color: C.text3, marginBottom: 6 },
  input:        { backgroundColor: C.bg, borderRadius: 8, borderWidth: 1, borderColor: C.border, color: C.text, fontSize: 14, paddingHorizontal: 12, paddingVertical: 10 },
  emailText:    { fontSize: 14, color: C.text2 },
  saveBtn:      { backgroundColor: C.mint, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  saveBtnTxt:   { fontSize: 13, fontWeight: '700', color: '#000' },
  linkRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderColor: C.border, marginBottom: 4 },
  linkTxt:      { fontSize: 14, color: C.text },
  chevron:      { fontSize: 12, color: C.text3 },
  logoutBtn:    { marginTop: 20, borderWidth: 1, borderColor: C.rose ?? '#f43f5e', borderRadius: 12, padding: 14, alignItems: 'center' },
  logoutTxt:    { fontSize: 14, fontWeight: '700', color: C.rose ?? '#f43f5e' },
});
