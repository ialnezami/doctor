'use strict';
import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

/**
 * ChatFloatingButton — absolute-positioned FAB to open the AI chatbot modal.
 *
 * Placed as a sibling to the tab navigator in PatientTabs so it floats
 * above all patient screens without being tied to a single tab.
 *
 * Visual: 56×56 blue circle, elevation 6, positioned bottom-right above tab bar.
 *
 * @param {{ onPress: () => void }} props
 */
export default function ChatFloatingButton({ onPress }) {
  return (
    <TouchableOpacity
      style={styles.fab}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityLabel="Open AI chat assistant"
      accessibilityRole="button"
    >
      <Text style={styles.label}>AI</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  label: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
