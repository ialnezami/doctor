import React, { useState, useEffect } from 'react';
import { Picker } from '@react-native-picker/picker';
import { View, Text, Switch, TouchableOpacity, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyDoctorProfile, updateDoctorSettings } from '../../api/doctors';
import { getMe } from '../../api/auth';
import { getNotificationPrefs, updateNotificationPrefs } from '../../api/users';
import useAuthStore from '../../store/authStore';
import AccountSection from '../../components/AccountSection';
import C from '../../constants/colors';

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const PREDEFINED_APPT_TYPES = [
  { key: 'initial',   label: 'Initial Consultation', duration: 30, fee: 0, enabled: true },
  { key: 'follow-up', label: 'Follow-up',            duration: 20, fee: 0, enabled: true },
  { key: 'check-up',  label: 'Check-up',             duration: 30, fee: 0, enabled: true },
  { key: 'urgent',    label: 'Urgent',               duration: 15, fee: 0, enabled: true },
];
const PRESET_DURATIONS = [15, 20, 30];

const TIMEZONES = [
  { label: 'UTC',                 value: 'UTC' },
  { label: 'Riyadh (AST +3)',     value: 'Asia/Riyadh' },
  { label: 'Dubai (GST +4)',      value: 'Asia/Dubai' },
  { label: 'Kuwait (AST +3)',     value: 'Asia/Kuwait' },
  { label: 'Cairo (EET +2)',      value: 'Africa/Cairo' },
  { label: 'London (GMT)',        value: 'Europe/London' },
  { label: 'Paris (CET +1)',      value: 'Europe/Paris' },
  { label: 'New York (ET -5)',    value: 'America/New_York' },
  { label: 'Los Angeles (PT -8)', value: 'America/Los_Angeles' },
  { label: 'Karachi (PKT +5)',    value: 'Asia/Karachi' },
  { label: 'Mumbai (IST +5:30)', value: 'Asia/Kolkata' },
  { label: 'Singapore (SGT +8)', value: 'Asia/Singapore' },
];

export default function SettingsScreen() {
  const { user: storeUser } = useAuthStore();
  const [me, setMe] = useState(null);
  const [doctorId, setDoctorId] = useState(null);
  const [autoAccept, setAutoAccept] = useState(false);
  const [slots, setSlots] = useState([]);
  const [timezone, setTimezone] = useState('UTC');
  const [consultationFee, setConsultationFee] = useState('');
  const [apptTypes, setApptTypes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pushEnabled,  setPushEnabled]  = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);

  useEffect(() => {
    getMe().then(setMe).catch(() => {});
  }, []);

  useEffect(() => {
    getMyDoctorProfile().then(doc => {
      setDoctorId(doc._id);
      setAutoAccept(doc.autoAcceptAppointments || false);
      setSlots(doc.availabilitySlots || []);
      setTimezone(doc.timezone || 'UTC');
      setConsultationFee(doc.consultationFee != null ? String(doc.consultationFee) : '');
      setApptTypes(doc.appointmentTypes?.length ? doc.appointmentTypes : PREDEFINED_APPT_TYPES);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    getNotificationPrefs().then(data => {
      if (data?.notificationPrefs) {
        setPushEnabled(data.notificationPrefs.pushEnabled);
        setEmailEnabled(data.notificationPrefs.emailEnabled);
      }
    }).catch(() => {});
  }, []);

  const save = async () => {
    if (!doctorId) return;
    setSaving(true);
    try {
      const fee = consultationFee.trim() === '' ? 0 : Number(consultationFee);
      await updateDoctorSettings(doctorId, { autoAcceptAppointments: autoAccept, availabilitySlots: slots, timezone, consultationFee: fee, appointmentTypes: apptTypes });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {} finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content}>
        <AccountSection user={me ?? storeUser} />
        <Text style={s.heading}>Settings</Text>

        <View style={s.card}>
          <View style={s.row}>
            <View style={{ flex:1 }}>
              <Text style={s.rowTitle}>Auto-accept appointments</Text>
              <Text style={s.rowSub}>Confirm bookings immediately without review</Text>
            </View>
            <Switch value={autoAccept} onValueChange={setAutoAccept} trackColor={{ true: C.mint }} />
          </View>
        </View>

        <View style={{ marginTop: 16, backgroundColor: C.bg3, borderRadius: 8, borderWidth: 1, borderColor: C.border, padding: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: C.text, marginBottom: 4 }}>
            Daily Digest Timezone
          </Text>
          <Text style={{ fontSize: 11, color: C.text2, marginBottom: 8 }}>
            Your morning schedule summary will arrive at 7:00 AM in this timezone.
          </Text>
          <Picker selectedValue={timezone} onValueChange={setTimezone} style={{ color: C.text }}>
            {TIMEZONES.map(tz => (
              <Picker.Item key={tz.value} label={tz.label} value={tz.value} />
            ))}
          </Picker>
        </View>

        <View style={{ marginTop: 16, backgroundColor: C.bg3, borderRadius: 8, borderWidth: 1, borderColor: C.border, padding: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: C.text, marginBottom: 12 }}>
            Notification Channels
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ fontSize: 12, color: C.text2 }}>Push notifications</Text>
            <Switch
              value={pushEnabled}
              onValueChange={async (val) => {
                setPushEnabled(val);
                await updateNotificationPrefs({ pushEnabled: val }).catch(() => setPushEnabled(!val));
              }}
              trackColor={{ false: C.border, true: C.mint }}
              thumbColor="#fff"
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, color: C.text2 }}>Email notifications</Text>
            <Switch
              value={emailEnabled}
              onValueChange={async (val) => {
                setEmailEnabled(val);
                await updateNotificationPrefs({ emailEnabled: val }).catch(() => setEmailEnabled(!val));
              }}
              trackColor={{ false: C.border, true: C.mint }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <Text style={s.sectionLabel}>Pricing</Text>
        <View style={s.card}>
          <Text style={s.rowTitle}>Consultation Fee</Text>
          <Text style={s.rowSub}>Amount patients pay per appointment</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 }}>
            <TextInput
              style={[s.timeInput, { flex: 1, textAlign: 'left', paddingHorizontal: 12 }]}
              value={consultationFee}
              onChangeText={val => setConsultationFee(val.replace(/[^0-9.]/g, ''))}
              placeholder="0"
              placeholderTextColor={C.text3}
              keyboardType="numeric"
            />
            <Text style={{ fontSize: 14, color: C.text2 }}>SAR</Text>
          </View>
        </View>

        <Text style={s.sectionLabel}>Appointment Types</Text>
        <View style={s.card}>
          <Text style={s.rowSub}>Set duration per visit type. Disabled types won't show to patients.</Text>
          <View style={{ height: 10 }} />
          {apptTypes.map((at, i) => {
            const isPredefined = ['initial','follow-up','check-up','urgent'].includes(at.key);
            const isCustomDuration = !PRESET_DURATIONS.includes(at.duration);
            return (
              <View key={at.key + i} style={[s.slotRow, { flexWrap: 'wrap', opacity: at.enabled ? 1 : 0.5 }]}>
                <Switch
                  value={at.enabled}
                  onValueChange={v => setApptTypes(a => a.map((x, idx) => idx === i ? { ...x, enabled: v } : x))}
                  trackColor={{ true: C.mint }}
                  thumbColor="#fff"
                />
                {isPredefined ? (
                  <Text style={[s.rowTitle, { flex: 1, fontSize: 13 }]}>{at.label}</Text>
                ) : (
                  <TextInput
                    style={[s.timeInput, { flex: 1, textAlign: 'left', paddingHorizontal: 8 }]}
                    value={at.label}
                    onChangeText={v => setApptTypes(a => a.map((x, idx) => idx === i ? { ...x, label: v } : x))}
                    placeholder="Type name"
                    placeholderTextColor={C.text3}
                  />
                )}
                <View style={s.slotDayPicker}>
                  <Picker
                    selectedValue={isCustomDuration ? 0 : at.duration}
                    onValueChange={v => setApptTypes(a => a.map((x, idx) => idx === i ? { ...x, duration: v === 0 ? 45 : v } : x))}
                    style={{ color: C.text, height: 36 }}
                    dropdownIconColor={C.text2}
                  >
                    {PRESET_DURATIONS.map(d => <Picker.Item key={d} label={`${d} min`} value={d} color={C.text} />)}
                    <Picker.Item label="Custom" value={0} color={C.text} />
                  </Picker>
                </View>
                {isCustomDuration && (
                  <TextInput
                    style={s.timeInput}
                    value={String(at.duration)}
                    onChangeText={v => setApptTypes(a => a.map((x, idx) => idx === i ? { ...x, duration: parseInt(v) || 30 } : x))}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <TextInput
                    style={[s.timeInput, { width: 56 }]}
                    value={String(at.fee ?? 0)}
                    onChangeText={v => setApptTypes(a => a.map((x, idx) => idx === i ? { ...x, fee: parseFloat(v) || 0 } : x))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={C.text3}
                    maxLength={6}
                  />
                  <Text style={{ fontSize: 10, color: C.text3 }}>SAR</Text>
                </View>
                {!isPredefined && (
                  <TouchableOpacity onPress={() => setApptTypes(a => a.filter((_, idx) => idx !== i))} hitSlop={6}>
                    <Text style={{ color: C.rose, fontSize: 20, lineHeight: 22 }}>×</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
          <TouchableOpacity
            onPress={() => setApptTypes(a => [...a, { key: `custom_${Date.now()}`, label: '', duration: 30, fee: 0, enabled: true }])}
            style={s.addBtn}
          >
            <Text style={s.addBtnTxt}>+ Add custom type</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.sectionLabel}>Availability</Text>
        <View style={s.card}>
          {slots.length === 0 && (
            <Text style={{ fontSize:12, color:C.text3, marginBottom:8 }}>No availability set.</Text>
          )}
          {slots.map((sl, i) => {
            const update = (field, val) =>
              setSlots(ss => ss.map((x, idx) => idx === i ? { ...x, [field]: val } : x));
            return (
              <View key={i} style={s.slotRow}>
                <View style={s.slotDayPicker}>
                  <Picker
                    selectedValue={sl.dayOfWeek}
                    onValueChange={val => update('dayOfWeek', val)}
                    style={{ color: C.text, height: 36 }}
                    dropdownIconColor={C.text2}
                  >
                    {DAYS.map((d, idx) => (
                      <Picker.Item key={d} label={d} value={idx} color={C.text} />
                    ))}
                  </Picker>
                </View>
                <TextInput
                  style={s.timeInput}
                  value={sl.startTime}
                  onChangeText={val => update('startTime', val)}
                  placeholder="09:00"
                  placeholderTextColor={C.text3}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
                <Text style={{ fontSize:11, color:C.text3 }}>–</Text>
                <TextInput
                  style={s.timeInput}
                  value={sl.endTime}
                  onChangeText={val => update('endTime', val)}
                  placeholder="17:00"
                  placeholderTextColor={C.text3}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
                <TouchableOpacity
                  onPress={() => setSlots(ss => ss.filter((_, idx) => idx !== i))}
                  hitSlop={6}
                >
                  <Text style={{ color:C.rose, fontSize:20, lineHeight:22 }}>×</Text>
                </TouchableOpacity>
              </View>
            );
          })}
          <TouchableOpacity
            onPress={() => setSlots(ss => [...ss, { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }])}
            style={s.addBtn}
          >
            <Text style={s.addBtnTxt}>+ Add day</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[s.saveBtn, saving && { opacity:0.6 }]} onPress={save} disabled={saving}>
          <Text style={s.saveBtnTxt}>{saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Settings'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex:1, backgroundColor:C.bg },
  content: { padding:20 },
  heading: { fontSize:22, fontWeight:'700', color:C.text, marginBottom:20 },
  card: { backgroundColor:C.card, borderRadius:12, borderWidth:1, borderColor:C.border, padding:16, marginBottom:16 },
  row: { flexDirection:'row', alignItems:'center', gap:12 },
  rowTitle: { fontSize:14, fontWeight:'500', color:C.text },
  rowSub: { fontSize:12, color:C.text2, marginTop:2 },
  sectionLabel: { fontSize:11, fontWeight:'600', color:C.text2, textTransform:'uppercase', letterSpacing:0.5, marginBottom:8 },
  slotRow:      { flexDirection:'row', alignItems:'center', gap:6, marginBottom:10 },
  slotDayPicker:{ flex:1, backgroundColor:C.bg3, borderRadius:6, borderWidth:1, borderColor:C.border, overflow:'hidden', height:40, justifyContent:'center' },
  timeInput:    { width:54, fontSize:13, color:C.text, backgroundColor:C.bg3, borderWidth:1, borderColor:C.border, borderRadius:6, paddingHorizontal:8, paddingVertical:6, textAlign:'center' },
  addBtn:       { marginTop:4 },
  addBtnTxt: { fontSize:13, color:C.mint },
  saveBtn: { backgroundColor:C.mint, borderRadius:12, padding:14, alignItems:'center', marginTop:8 },
  saveBtnTxt: { fontSize:15, fontWeight:'700', color:'#000' },
});
