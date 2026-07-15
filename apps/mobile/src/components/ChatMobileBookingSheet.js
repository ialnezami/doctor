'use strict';
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Animated,
} from 'react-native';
import { getAvailableSlots } from '../api/doctors';
import { createAppointment } from '../api/appointments';

const SHEET_HEIGHT = 440;

function toISODate(date) {
  return date.toISOString().split('T')[0];
}

function formatDateLabel(date) {
  return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
}

/**
 * ChatMobileBookingSheet — slide-up bottom sheet for booking an appointment
 * directly from a chatbot doctor recommendation card.
 *
 * Props:
 *   doctor  — doctor object from the chatbot 'done' event (or null)
 *   visible — controls slide-in/out animation
 *   onDone  — (successMessage: string) => void  called after successful booking
 *   onCancel — () => void  called when user dismisses without booking
 */
export default function ChatMobileBookingSheet({ doctor, visible, onDone, onCancel }) {
  const sheetAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const [isShowing, setIsShowing] = useState(false);

  const [selectedDate, setSelectedDate] = useState(null);
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState(null);

  // Next 7 days (today+1 … today+7), recomputed each time the sheet opens
  const dateChips = useMemo(() => {
    if (!visible) return [];
    const chips = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      chips.push(d);
    }
    return chips;
  }, [visible]);

  useEffect(() => {
    if (visible) {
      setIsShowing(true);
      Animated.timing(sheetAnim, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(sheetAnim, {
        toValue: SHEET_HEIGHT,
        duration: 220,
        useNativeDriver: true,
      }).start(() => {
        setIsShowing(false);
        setSelectedDate(null);
        setSlots([]);
        setSelectedSlot(null);
        setError(null);
      });
    }
  }, [visible]);

  const fetchSlots = useCallback(
    async (date) => {
      if (!doctor?._id) return;
      setSlotsLoading(true);
      setSlots([]);
      setSelectedSlot(null);
      setError(null);
      try {
        const res = await getAvailableSlots(doctor._id, toISODate(date));
        const raw = res?.data?.slots ?? res?.data ?? [];
        setSlots(Array.isArray(raw) ? raw.filter((s) => s.available !== false) : []);
      } catch {
        setError('Could not load available slots. Please try again.');
      } finally {
        setSlotsLoading(false);
      }
    },
    [doctor]
  );

  const onDateSelect = (date) => {
    setSelectedDate(date);
    fetchSlots(date);
  };

  const onConfirm = async () => {
    if (!selectedDate || !selectedSlot || booking) return;
    setBooking(true);
    setError(null);
    try {
      await createAppointment({
        doctorId: doctor._id,
        date: toISODate(selectedDate),
        time: selectedSlot.time,
      });
      const doctorName = doctor?.user?.name || 'the doctor';
      onDone(
        `Appointment booked with Dr. ${doctorName} on ${formatDateLabel(selectedDate)} at ${selectedSlot.time}.`
      );
    } catch (err) {
      const msg = err?.response?.data?.message;
      setError(msg || 'Booking failed. The slot may no longer be available.');
    } finally {
      setBooking(false);
    }
  };

  if (!isShowing) return null;

  const doctorName = doctor?.user?.name || 'Doctor';

  return (
    <>
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onCancel}
        accessibilityLabel="Dismiss booking sheet"
      />
      <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetAnim }] }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Book with Dr. {doctorName}
          </Text>
          <TouchableOpacity
            onPress={onCancel}
            style={styles.closeBtn}
            accessibilityLabel="Close booking sheet"
            accessibilityRole="button"
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Date chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateChips}
        >
          {dateChips.map((d) => {
            const iso = toISODate(d);
            const isSelected = selectedDate && toISODate(selectedDate) === iso;
            return (
              <TouchableOpacity
                key={iso}
                style={[styles.chip, isSelected && styles.chipSelected]}
                onPress={() => onDateSelect(d)}
                accessibilityLabel={formatDateLabel(d)}
                accessibilityRole="button"
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                  {formatDateLabel(d)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Slot area */}
        <View style={styles.slotsOuter}>
          {!selectedDate && <Text style={styles.hint}>Select a date to see available slots</Text>}
          {selectedDate && slotsLoading && (
            <ActivityIndicator size="small" color="#2563eb" style={styles.spinner} />
          )}
          {selectedDate && !slotsLoading && slots.length === 0 && !error && (
            <Text style={styles.hint}>No slots available on this date</Text>
          )}
          {selectedDate && !slotsLoading && slots.length > 0 && (
            <View style={styles.slotGrid}>
              {slots.map((slot) => {
                const isSelected = selectedSlot?.time === slot.time;
                return (
                  <TouchableOpacity
                    key={slot.time}
                    style={[styles.slotPill, isSelected && styles.slotPillSelected]}
                    onPress={() => setSelectedSlot(slot)}
                    accessibilityLabel={slot.time}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.slotText, isSelected && styles.slotTextSelected]}>
                      {slot.time}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.confirmBtn, (!selectedSlot || booking) && styles.confirmBtnDisabled]}
          onPress={onConfirm}
          disabled={!selectedSlot || booking}
          accessibilityLabel="Confirm booking"
          accessibilityRole="button"
        >
          <Text style={styles.confirmBtnText}>{booking ? 'Booking…' : 'Confirm Booking'}</Text>
        </TouchableOpacity>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 98,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingBottom: 24,
    zIndex: 99,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginRight: 12,
  },
  closeBtn: { padding: 4 },
  closeBtnText: { fontSize: 18, color: '#6b7280' },
  dateChips: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipSelected: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 13, fontWeight: '500', color: '#374151' },
  chipTextSelected: { color: '#ffffff' },
  slotsOuter: {
    flex: 1,
    paddingHorizontal: 12,
  },
  hint: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 16,
  },
  spinner: { marginTop: 16 },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 4,
  },
  slotPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  slotPillSelected: { backgroundColor: '#dbeafe', borderColor: '#2563eb' },
  slotText: { fontSize: 13, color: '#374151' },
  slotTextSelected: { color: '#1d4ed8', fontWeight: '600' },
  errorText: {
    fontSize: 13,
    color: '#dc2626',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  confirmBtn: {
    marginHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#2563eb',
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmBtnDisabled: { backgroundColor: '#9ca3af' },
  confirmBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
});
