import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import C from '../../constants/colors';
import { submitReview } from '../../api/reviews';

function StarPicker({ value, onChange }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginVertical: 12 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <TouchableOpacity key={n} onPress={() => onChange(n)}>
          <Text style={{ fontSize: 36, color: n <= value ? C.amber : C.border2 }}>★</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function WriteReviewScreen({ route, navigation }) {
  const { appointmentId, doctorName } = route.params;
  const { t } = useTranslation();
  const [rating, setRating]   = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (rating === 0) {
      Alert.alert(t('reviews.rating'), 'Please select a star rating.');
      return;
    }
    setLoading(true);
    try {
      await submitReview(appointmentId, rating, comment.trim());
      Alert.alert(t('reviews.successTitle'), t('reviews.successMsg'), [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      const msg = err.response?.data?.message || t('common.error');
      Alert.alert(t('common.error'), msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={s.container}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={{ color: C.mint, fontSize: 14 }}>← {t('common.cancel')}</Text>
        </TouchableOpacity>

        <Text style={s.title}>{t('reviews.writeReview')}</Text>
        <Text style={s.doctorName}>{doctorName}</Text>

        <Text style={s.label}>{t('reviews.rating')}</Text>
        <StarPicker value={rating} onChange={setRating} />

        <Text style={s.label}>{t('reviews.comment')}</Text>
        <TextInput
          style={s.input}
          multiline
          numberOfLines={4}
          maxLength={1000}
          placeholder={t('reviews.commentPlaceholder')}
          placeholderTextColor={C.text3}
          value={comment}
          onChangeText={setComment}
        />
        <Text style={s.charCount}>{comment.length} / 1000</Text>

        <TouchableOpacity
          style={[s.btn, loading && { opacity: 0.6 }]}
          onPress={submit}
          disabled={loading}
        >
          <Text style={s.btnTxt}>{loading ? t('reviews.submitting') : t('reviews.submit')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:  { padding: 20 },
  back:       { marginBottom: 20 },
  title:      { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 4 },
  doctorName: { fontSize: 14, color: C.mint, marginBottom: 20 },
  label:      { fontSize: 13, fontWeight: '600', color: C.text2, marginBottom: 4 },
  input:      { backgroundColor: C.bg3, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, color: C.text, fontSize: 13, minHeight: 100, textAlignVertical: 'top' },
  charCount:  { fontSize: 11, color: C.text3, textAlign: 'right', marginTop: 4, marginBottom: 20 },
  btn:        { backgroundColor: C.mint, borderRadius: 10, padding: 14, alignItems: 'center' },
  btnTxt:     { fontSize: 15, fontWeight: '700', color: '#000' },
});
