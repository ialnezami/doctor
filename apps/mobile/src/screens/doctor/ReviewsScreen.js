import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, TextInput, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import C from '../../constants/colors';
import { getDoctorReviews, flagReview } from '../../api/reviews';
import useAuthStore from '../../store/authStore';

function Stars({ rating }) {
  const full = Math.round(rating);
  return (
    <Text>
      {[1, 2, 3, 4, 5].map(n => (
        <Text key={n} style={{ fontSize: 14, color: n <= full ? C.amber : C.border2 }}>★</Text>
      ))}
    </Text>
  );
}

export default function ReviewsScreen({ navigation }) {
  const { user } = useAuthStore();
  const { t }    = useTranslation();
  const [data, setData]             = useState({ reviews: [], averageRating: 0, reviewCount: 0, totalPages: 1 });
  const [page, setPage]             = useState(1);
  const [flagModal, setFlagModal]   = useState(null);
  const [flagReason, setFlagReason] = useState('');
  const [flagging, setFlagging]     = useState(false);

  const load = useCallback((p = 1) => {
    if (!user?.id) return;
    getDoctorReviews(user.id, p)
      .then(d => {
        setData(prev => p === 1
          ? d
          : { ...d, reviews: [...prev.reviews, ...d.reviews] }
        );
        setPage(p);
      })
      .catch(() => {});
  }, [user?.id]);

  useFocusEffect(useCallback(() => { load(1); }, [load]));

  const doFlag = async () => {
    if (!flagModal) return;
    setFlagging(true);
    try {
      await flagReview(flagModal, flagReason.trim());
      Alert.alert('', t('reviews.flagSuccess'));
      setFlagModal(null);
      setFlagReason('');
      load(1);
    } catch (err) {
      Alert.alert(t('common.error'), err.response?.data?.message || t('common.error'));
    } finally {
      setFlagging(false);
    }
  };

  const ReviewCard = ({ item }) => {
    const name     = item.patientId?.name || 'Patient';
    const initials = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('');
    const display  = `${name.split(' ')[0]} ${name.split(' ')[1]?.[0] || ''}.`;
    return (
      <View style={s.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <View style={s.avatar}><Text style={s.initials}>{initials}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.patName}>{display}</Text>
            <Stars rating={item.rating} />
          </View>
          <Text style={s.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
        </View>
        {!!item.comment && <Text style={s.comment}>{item.comment}</Text>}
        {!item.flagged
          ? <TouchableOpacity style={s.flagBtn} onPress={() => { setFlagModal(item._id); setFlagReason(''); }}>
              <Text style={s.flagTxt}>{t('reviews.flag')}</Text>
            </TouchableOpacity>
          : <Text style={s.flaggedLabel}>⚑ Reported</Text>
        }
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 12 }}>
          <Text style={{ color: C.mint, fontSize: 14 }}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>{t('reviews.title')}</Text>
        {data.reviewCount > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <Text style={s.bigRating}>{data.averageRating}</Text>
            <Stars rating={data.averageRating} />
            <Text style={{ color: C.text3, fontSize: 12 }}>({data.reviewCount})</Text>
          </View>
        )}
      </View>

      <FlatList
        data={data.reviews}
        keyExtractor={r => r._id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => <ReviewCard item={item} />}
        ListEmptyComponent={<Text style={s.empty}>{t('reviews.noReviews')}</Text>}
        onEndReached={() => { if (page < data.totalPages) load(page + 1); }}
        onEndReachedThreshold={0.3}
      />

      <Modal visible={!!flagModal} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>{t('reviews.flagConfirm')}</Text>
            <TextInput
              style={s.modalInput}
              placeholder={t('reviews.flagReason')}
              placeholderTextColor={C.text3}
              value={flagReason}
              onChangeText={setFlagReason}
              maxLength={500}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: C.bg3 }]} onPress={() => setFlagModal(null)}>
                <Text style={{ color: C.text2, fontWeight: '600' }}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: C.rose }]} onPress={doFlag} disabled={flagging}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{flagging ? '…' : t('reviews.flag')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header:     { padding: 20, borderBottomWidth: 1, borderBottomColor: C.border },
  title:      { fontSize: 22, fontWeight: '700', color: C.text },
  bigRating:  { fontSize: 32, fontWeight: '700', color: C.amber },
  card:       { backgroundColor: C.bg3, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 10 },
  avatar:     { width: 36, height: 36, borderRadius: 18, backgroundColor: C.mintDim, justifyContent: 'center', alignItems: 'center' },
  initials:   { fontSize: 12, fontWeight: '700', color: C.mint },
  patName:    { fontSize: 13, fontWeight: '600', color: C.text },
  date:       { fontSize: 11, color: C.text3 },
  comment:    { fontSize: 13, color: C.text2, lineHeight: 18, marginBottom: 8 },
  flagBtn:    { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(244,63,94,0.3)', backgroundColor: 'rgba(244,63,94,0.08)' },
  flagTxt:    { fontSize: 11, fontWeight: '600', color: C.rose },
  flaggedLabel:{ fontSize: 11, color: C.text3 },
  empty:      { fontSize: 13, color: C.text3, textAlign: 'center', marginTop: 40 },
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modalBox:   { backgroundColor: C.bg2, borderRadius: 14, padding: 20, borderWidth: 1, borderColor: C.border },
  modalTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 12 },
  modalInput: { backgroundColor: C.bg3, borderRadius: 8, borderWidth: 1, borderColor: C.border, padding: 10, color: C.text, fontSize: 13 },
  modalBtn:   { flex: 1, borderRadius: 8, padding: 12, alignItems: 'center' },
});
