'use strict';
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Linking,
  Alert,
} from 'react-native';
import { useChatbotStream } from '../../hooks/useChatbotStream';
import ChatMessage from '../../components/ChatMessage';
import UrgencyBadge from '../../components/UrgencyBadge';
import DoctorRecommendationCard from '../../components/DoctorRecommendationCard';
import ChatMobileBookingSheet from '../../components/ChatMobileBookingSheet';

/**
 * ChatbotScreen — full-screen AI health assistant modal.
 *
 * Features:
 *   - Streams assistant responses token-by-token via SSE (useChatbotStream)
 *   - Renders markdown in assistant messages (ChatMessage)
 *   - Shows urgency triage badge after 'done' event (UrgencyBadge)
 *   - EMERGENCY path: red banner + Call 911 CTA; doctor cards suppressed (threat T-09.2-03)
 *   - Non-emergency path: up to 5 ranked doctor cards in FlatList footer
 *   - Reset: clears local state + calls DELETE /chatbot/session
 *   - KeyboardAvoidingView so input doesn't hide behind keyboard
 *
 * Navigation:
 *   Presented as a modal (presentation: 'modal') from PatientTabs stack.
 *   route.params may carry { lat, lng } from caller for geo-aware doctor recs.
 */
export default function ChatbotScreen({ navigation, route }) {
  const lat = route?.params?.lat;
  const lng = route?.params?.lng;

  const { messages, streaming, urgency, emergency, doctors, error, send, reset, appendLocal } =
    useChatbotStream({ lat, lng });

  const [input, setInput] = useState('');
  const [bookingDoctor, setBookingDoctor] = useState(null);
  const listRef = useRef(null);

  // Auto-scroll to latest message as stream progresses
  useEffect(() => {
    if (listRef.current && messages.length > 0) {
      listRef.current.scrollToEnd({ animated: true });
    }
  }, [messages]);

  const onSend = () => {
    const text = input.trim();
    if (!text || streaming) return;
    send(text);
    setInput('');
  };

  /**
   * Call 911 handler.
   * Opens the dialer via tel: URI. On simulator, falls back to an Alert so
   * testers are not confused by a silent no-op.
   */
  const onCall911 = () => {
    Linking.openURL('tel:911').catch(() =>
      Alert.alert(
        'Cannot dial automatically',
        'Please call emergency services immediately by dialing 911.',
        [{ text: 'OK' }]
      )
    );
  };

  const onDoctorPress = (doctorId) => {
    // Navigate to existing DoctorProfile screen (no new nav logic needed)
    navigation.navigate('DoctorProfile', { doctorId });
  };

  const onReset = () => {
    Alert.alert(
      'Reset conversation?',
      'Your chat history will be cleared and a new session will start.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: reset },
      ]
    );
  };

  /**
   * Doctor cards footer for the FlatList.
   * Suppressed entirely when emergency=true (threat T-09.2-03 mitigation).
   * Only rendered when doctors array is non-empty AND not in emergency state.
   */
  const renderDoctorsFooter = () => {
    if (emergency || !doctors.length) return null;
    return (
      <View style={styles.doctorsSection}>
        <Text style={styles.doctorsHeader}>Recommended doctors near you</Text>
        {doctors.map((d) => (
          <DoctorRecommendationCard
            key={d._id}
            doctor={d}
            onPress={onDoctorPress}
            onBook={setBookingDoctor}
          />
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityLabel="Close chat"
          accessibilityRole="button"
          style={styles.headerTouchable}
        >
          <Text style={styles.headerBtn}>Close</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>AI Health Assistant</Text>

        <TouchableOpacity
          onPress={onReset}
          accessibilityLabel="Reset conversation"
          accessibilityRole="button"
          style={styles.headerTouchable}
        >
          <Text style={styles.headerBtn}>Reset</Text>
        </TouchableOpacity>
      </View>

      {/* Urgency badge row — visible after triage is parsed */}
      {urgency ? (
        <View style={styles.urgencyRow}>
          <UrgencyBadge urgency={urgency} />
        </View>
      ) : null}

      {/* Emergency banner — shown INSTEAD OF doctor cards, never alongside them */}
      {emergency ? (
        <View style={styles.emergencyBanner}>
          <Text style={styles.emergencyText}>
            EMERGENCY — Call emergency services now
          </Text>
          <TouchableOpacity
            onPress={onCall911}
            style={styles.emergencyBtn}
            accessibilityLabel="Call 911"
            accessibilityRole="button"
          >
            <Text style={styles.emergencyBtnText}>Call 911</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Message list with doctor cards in footer */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <ChatMessage role={item.role} content={item.content} />
        )}
        ListFooterComponent={renderDoctorsFooter}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
      />

      {/* Error toast — amber bar above input */}
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <ChatMobileBookingSheet
        doctor={bookingDoctor}
        visible={!!bookingDoctor}
        onDone={(msg) => {
          setBookingDoctor(null);
          appendLocal(msg);
        }}
        onCancel={() => setBookingDoctor(null)}
      />

      {/* Input area */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Describe your symptoms..."
            placeholderTextColor="#9ca3af"
            editable={!streaming}
            maxLength={2000}
            multiline
            style={styles.input}
            accessibilityLabel="Chat input"
            returnKeyType="default"
          />
          <TouchableOpacity
            onPress={onSend}
            disabled={streaming || !input.trim()}
            style={[
              styles.sendBtn,
              (streaming || !input.trim()) && styles.sendBtnDisabled,
            ]}
            accessibilityLabel="Send message"
            accessibilityRole="button"
          >
            <Text style={styles.sendBtnText}>{streaming ? '...' : 'Send'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  headerTouchable: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    minWidth: 56,
  },
  headerBtn: {
    color: '#2563eb',
    fontSize: 16,
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    textAlign: 'center',
  },
  urgencyRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  emergencyBanner: {
    backgroundColor: '#fee2e2',
    marginHorizontal: 12,
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  emergencyText: {
    color: '#7f1d1d',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  emergencyBtn: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 24,
  },
  emergencyBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  listContent: {
    paddingVertical: 12,
    paddingBottom: 20,
  },
  doctorsSection: {
    marginTop: 16,
    paddingBottom: 8,
  },
  doctorsHeader: {
    paddingHorizontal: 12,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  errorBanner: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 8,
  },
  errorText: {
    color: '#92400e',
    fontSize: 13,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#f3f4f6',
    borderRadius: 22,
    fontSize: 15,
    color: '#111827',
  },
  sendBtn: {
    marginLeft: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#2563eb',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 64,
  },
  sendBtnDisabled: {
    backgroundColor: '#9ca3af',
  },
  sendBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
