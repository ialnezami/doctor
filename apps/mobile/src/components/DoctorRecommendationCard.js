'use strict';
import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';

/**
 * Convert a distance in metres to a human-readable km string.
 * e.g. 1234 → "1.2 km"  |  800 → "0.8 km"
 *
 * @param {number|undefined} distMeters
 * @returns {string}
 */
function formatDistance(distMeters) {
  if (distMeters == null || Number.isNaN(distMeters)) return '';
  return `${(distMeters / 1000).toFixed(1)} km`;
}

/**
 * Derive initials from a full name for the avatar fallback.
 *
 * @param {string} name
 * @returns {string}
 */
function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

/**
 * DoctorRecommendationCard — horizontal card showing a ranked doctor suggestion
 * from the chatbot's geo-aware recommendation engine.
 *
 * Doctor shape (from 09.1 backend $geoNear pipeline):
 *   { _id, specialty, photoUrl, averageRating, reviewCount, consultationFee,
 *     distMeters, user: { name }, locations: [...] }
 *
 * Tapping the card calls onPress(doctor._id) so the parent navigates to DoctorProfile.
 * Optional onBook(doctor) renders a "Book" button for inline booking flows.
 *
 * @param {{ doctor: object, onPress: (doctorId: string) => void, onBook?: (doctor: object) => void }} props
 */
export default function DoctorRecommendationCard({ doctor, onPress, onBook }) {
  const name = doctor?.user?.name || 'Doctor';
  const initials = getInitials(name);
  const distance = formatDistance(doctor?.distMeters);
  const rating = doctor?.averageRating != null ? doctor.averageRating.toFixed(1) : null;
  const reviewCount = doctor?.reviewCount ?? 0;
  const fee = doctor?.consultationFee;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.75}
      onPress={() => onPress && onPress(doctor._id)}
      accessibilityLabel={`View profile of ${name}`}
      accessibilityRole="button"
    >
      {/* Avatar: photo if available, initials fallback */}
      {doctor?.photoUrl ? (
        <Image source={{ uri: doctor.photoUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
      )}

      {/* Doctor info */}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.specialty} numberOfLines={1}>
          {doctor?.specialty || ''}
        </Text>

        <View style={styles.metaRow}>
          {rating && (
            <Text style={styles.rating}>
              ★ {rating}
              {reviewCount > 0 ? ` (${reviewCount})` : ''}
            </Text>
          )}
          {distance ? <Text style={styles.distance}>{distance}</Text> : null}
          {fee != null && fee > 0 ? (
            <Text style={styles.fee}>{fee} SAR</Text>
          ) : null}
        </View>
      </View>

      {onBook ? (
        <TouchableOpacity
          style={styles.bookBtn}
          onPress={() => onBook(doctor)}
          accessibilityLabel={`Book appointment with ${name}`}
          accessibilityRole="button"
        >
          <Text style={styles.bookBtnText}>Book</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.chevron}>›</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginVertical: 6,
    marginHorizontal: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  avatarFallback: {
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  specialty: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  rating: {
    fontSize: 12,
    color: '#d97706',
    fontWeight: '600',
  },
  distance: {
    fontSize: 12,
    color: '#6b7280',
  },
  fee: {
    fontSize: 12,
    color: '#374151',
  },
  chevron: {
    fontSize: 22,
    color: '#9ca3af',
    marginLeft: 8,
  },
  bookBtn: {
    marginLeft: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#2563eb',
    borderRadius: 8,
  },
  bookBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
});
