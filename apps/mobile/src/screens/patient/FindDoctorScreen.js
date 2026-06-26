import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { getDoctors } from '../../api/doctors';
import ErrorState from '../../components/ErrorState';
import C from '../../constants/colors';

const SPECS = ['All', 'Cardiology', 'Pediatrics', 'Neurology', 'Orthopedics', 'General'];
const AVATAR_COLORS = ['#0fe3b0', '#f59e0b', '#8b5cf6', '#10b981', '#60a5fa', '#f43f5e'];

export default function FindDoctorScreen({ navigation }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [spec, setSpec]     = useState('All');
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchDrs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.name = search;
      if (spec !== 'All') params.specialty = spec;
      const data = await getDoctors(params);
      setDoctors(data);
    } catch {
      setDoctors([]);
    } finally {
      setLoading(false);
    }
  }, [search, spec]);

  useEffect(() => {
    const t = setTimeout(fetchDrs, 350);
    return () => clearTimeout(t);
  }, [fetchDrs]);

  const resultLabel = loading
    ? t('findDoctor.searching')
    : t('findDoctor.result', { count: doctors.length });

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>{t('findDoctor.title')}</Text>
        <Text style={s.sub}>{resultLabel}</Text>
      </View>

      {/* Search */}
      <View style={s.searchBox}>
        <Text style={s.searchIcon}>⌕</Text>
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={t('findDoctor.searchPlaceholder')}
          placeholderTextColor={C.text3}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Specialty chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.chipRow}
        contentContainerStyle={s.chipContent}
      >
        {SPECS.map(sp => (
          <TouchableOpacity
            key={sp}
            style={[s.chip, spec === sp && s.chipActive]}
            onPress={() => setSpec(sp)}
            activeOpacity={0.7}
          >
            <Text style={[s.chipTxt, spec === sp && s.chipTxtActive]}>{t(`findDoctor.specialties.${sp}`, sp)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Results */}
      {loading ? (
        <ActivityIndicator color={C.mint} style={s.spinner} />
      ) : (
        <FlatList
          data={doctors}
          keyExtractor={d => d._id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <ErrorState
              icon="🔍"
              title={t('findDoctor.noResults')}
              message={t('findDoctor.noResultsHint')}
            />
          }
          renderItem={({ item: d, index: i }) => {
            const name     = d.userId?.name || 'Doctor';
            const initials = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('');
            const avatarBg = AVATAR_COLORS[i % AVATAR_COLORS.length];
            const hasSlots = d.availabilitySlots?.length > 0;

            return (
              <TouchableOpacity
                style={s.card}
                activeOpacity={0.75}
                onPress={() => navigation.navigate('DoctorProfile', {
                  doctorId: d._id,
                  doctorUserId: d.userId?._id || d.userId,
                })}
              >
                {/* Avatar */}
                <View style={[s.avatar, { backgroundColor: avatarBg }]}>
                  <Text style={s.avatarTxt}>{initials}</Text>
                </View>

                {/* Info */}
                <View style={s.cardBody}>
                  <Text style={s.docName} numberOfLines={1}>{name}</Text>
                  <Text style={s.specialty} numberOfLines={1}>{d.specialty}</Text>
                  <View style={s.cardMeta}>
                    {hasSlots && (
                      <View style={s.availBadge}>
                        <View style={s.availDot} />
                        <Text style={s.availTxt}>{t('findDoctor.available')}</Text>
                      </View>
                    )}
                    {d.consultationFee > 0 && (
                      <Text style={s.fee}>{d.consultationFee} SAR</Text>
                    )}
                  </View>
                </View>

                {/* Chevron */}
                <Text style={s.chevron}>›</Text>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: C.bg },
  header:      { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  title:       { fontSize: 22, fontWeight: '700', color: C.text },
  sub:         { fontSize: 12, color: C.text3, marginTop: 2 },

  searchBox:   { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 10, backgroundColor: C.bg2, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, height: 44 },
  searchIcon:  { fontSize: 16, color: C.text3, marginRight: 6 },
  searchInput: { flex: 1, color: C.text, fontSize: 14 },

  chipRow:     { flexShrink: 0, flexGrow: 0, marginBottom: 10 },
  chipContent: { paddingHorizontal: 16, gap: 6, alignItems: 'center' },
  chip:        { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: C.border2 },
  chipActive:  { borderColor: C.mint, backgroundColor: C.mintDim },
  chipTxt:     { fontSize: 12, color: C.text2 },
  chipTxtActive: { color: C.mint, fontWeight: '600' },

  spinner:     { marginTop: 24 },

  list:        { paddingHorizontal: 16, paddingBottom: 16 },

  card:        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, marginBottom: 10 },
  avatar:      { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarTxt:   { fontSize: 16, fontWeight: '700', color: '#fff' },
  cardBody:    { flex: 1, gap: 2 },
  docName:     { fontSize: 15, fontWeight: '600', color: C.text },
  specialty:   { fontSize: 12, color: C.mint },
  cardMeta:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  availBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  availDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: C.mint },
  availTxt:    { fontSize: 11, color: C.text2 },
  fee:         { fontSize: 11, color: C.text3 },
  chevron:     { fontSize: 22, color: C.text3, marginLeft: 4 },
});
