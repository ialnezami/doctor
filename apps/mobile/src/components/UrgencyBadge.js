'use strict';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * Urgency level metadata for the triage badge.
 * Colors chosen to be accessible (WCAG AA contrast on white text):
 *   routine   — green  (#16a34a)
 *   soon      — blue   (#2563eb)
 *   urgent    — orange (#ea580c)
 *   emergency — red    (#dc2626)
 */
const URGENCY_CONFIG = {
  routine: { color: '#16a34a', label: 'Routine' },
  soon: { color: '#2563eb', label: 'Soon' },
  urgent: { color: '#ea580c', label: 'Urgent' },
  emergency: { color: '#dc2626', label: '! Emergency' },
};

/**
 * UrgencyBadge — displays a colored pill reflecting the triage urgency level.
 *
 * Returns null when urgency is null/undefined so the caller does not need
 * conditional rendering.
 *
 * Emergency includes a "!" prefix to draw attention even for users with
 * color vision deficiency (threat T-09.2-03 — safety signal must be clear).
 *
 * @param {{ urgency: 'routine'|'soon'|'urgent'|'emergency'|null }} props
 */
export default function UrgencyBadge({ urgency }) {
  if (!urgency) return null;

  const config = URGENCY_CONFIG[urgency];
  if (!config) return null;

  return (
    <View style={[styles.badge, { backgroundColor: config.color }]}>
      <Text style={styles.text}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  text: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
