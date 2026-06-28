import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import C from '../../constants/colors';
import { getAppointments, updateStatus, toggleReminderOptOut } from '../../api/appointments';

const STATUS_COLOR = { confirmed: C.mint, pending: C.amber, cancelled: C.rose, completed: C.blue, validated: C.mint };

function isReviewEligible(appt) {
  if (appt.status !== 'validated') return false;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(appt.updatedAt).getTime() <= sevenDaysMs;
}

export default function MyAppointmentsScreen({ navigation }) {
  const { t } = useTranslation();
  const [appts, setAppts] = useState([]);
  const load = useCallback(() => { getAppointments().then(setAppts).catch(() => {}); }, []);
  useFocusEffect(load);

  const cancel = (id) => {
    Alert.alert(
      'Cancel Appointment',
      'Are you sure you want to cancel this appointment?',
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: 'Cancel Appointment', style: 'destructive', onPress: async () => { await updateStatus(id, 'cancelled'); load(); } },
      ]
    );
  };

  const upcoming = appts.filter(a => ['pending', 'confirmed'].includes(a.status));
  const past     = appts.filter(a => ['completed', 'cancelled', 'validated'].includes(a.status));

  const Item = ({ a, isPast }) => {
    const eligible = isPast && isReviewEligible(a);
    const isDatePast = new Date(a.date) < new Date(new Date().setHours(0, 0, 0, 0));
    return (
      <View style={[s.card, !isPast && { borderColor: 'rgba(15,227,176,0.25)' }]}>
        <View style={s.row}>
          <View style={[s.avatar, { backgroundColor: C.mint }]}>
            <Text style={s.avTxt}>{a.doctorId?.name?.split(' ').slice(1, 3).map(w => w[0]).join('') || 'DR'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.docName}>{a.doctorId?.name}</Text>
            <Text style={s.meta}>{new Date(a.date).toLocaleDateString()} · {a.timeSlot?.start}</Text>
          </View>
          <View style={[s.chip, { backgroundColor: (STATUS_COLOR[a.status] || C.mint) + '22' }]}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: STATUS_COLOR[a.status] || C.mint }}>{a.status}</Text>
          </View>
          {!isPast && (
            <>
              {a.status === 'confirmed' && (
                <TouchableOpacity
                  style={[s.cancelBtn, { backgroundColor: 'rgba(124,58,237,0.13)', borderColor: 'rgba(124,58,237,0.25)', marginRight: 4 }]}
                  onPress={() => navigation.navigate('VideoCall', {
                    appointmentId: a._id,
                    otherPartyName: a.doctorId?.name || 'Doctor',
                    role: 'patient',
                  })}
                >
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#a78bfa' }}>🎥</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[s.cancelBtn, { backgroundColor: 'rgba(15,227,176,0.13)', borderColor: 'rgba(15,227,176,0.25)', marginRight: 4 }]}
                onPress={() => navigation.navigate('Chat', { appointmentId: a._id, otherPartyName: a.doctorId?.name || 'Doctor' })}
              >
                <Text style={{ fontSize: 11, fontWeight: '600', color: C.mint }}>💬</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.cancelBtn, isDatePast && { opacity: 0.4 }]} disabled={isDatePast} onPress={() => cancel(a._id)}>
                <Text style={s.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
        {a.status === 'confirmed' && new Date(a.date) > new Date() && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border }}>
            <Text style={{ fontSize: 11, color: C.text2 }}>Disable reminders</Text>
            <Switch
              value={!!a.remindersDisabled}
              onValueChange={async (val) => {
                await toggleReminderOptOut(a._id, val);
                load();
              }}
              trackColor={{ false: C.border, true: C.rose }}
              thumbColor="#fff"
            />
          </View>
        )}
        {eligible && (
          <TouchableOpacity
            style={s.reviewBtn}
            onPress={() => navigation.navigate('WriteReview', {
              appointmentId: a._id,
              doctorName:    a.doctorId?.name || 'Doctor',
            })}
          >
            <Text style={s.reviewTxt}>⭐ {t('reviews.leaveReview')}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.header}><Text style={s.title}>{t('appointments.title')}</Text></View>
      <FlatList
        data={[...upcoming, ...past]}
        keyExtractor={a => a._id}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={<Text style={s.section}>{upcoming.length > 0 ? 'UPCOMING' : 'NO UPCOMING APPOINTMENTS'}</Text>}
        renderItem={({ item: a }) => <Item a={a} isPast={['completed', 'cancelled', 'validated'].includes(a.status)} />}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header:    { padding: 20, borderBottomWidth: 1, borderBottomColor: C.border },
  title:     { fontSize: 22, fontWeight: '700', color: C.text },
  section:   { fontSize: 10, fontWeight: '600', letterSpacing: 0.8, color: C.text2, marginBottom: 12 },
  card:      { backgroundColor: C.bg3, borderRadius: 8, borderWidth: 1, borderColor: C.border, marginBottom: 8, overflow: 'hidden' },
  row:       { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  avatar:    { width: 38, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  avTxt:     { fontSize: 12, fontWeight: '700', color: '#fff' },
  docName:   { fontSize: 13, fontWeight: '500', color: C.text },
  meta:      { fontSize: 11, color: C.text2, marginTop: 2 },
  chip:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  cancelBtn: { backgroundColor: 'rgba(244,63,94,0.13)', borderRadius: 6, padding: 6, borderWidth: 1, borderColor: 'rgba(244,63,94,0.25)' },
  cancelTxt: { fontSize: 11, fontWeight: '600', color: C.rose },
  reviewBtn: { borderTopWidth: 1, borderTopColor: C.border, padding: 10, alignItems: 'center', backgroundColor: C.mintDim },
  reviewTxt: { fontSize: 12, fontWeight: '700', color: C.mint },
});
