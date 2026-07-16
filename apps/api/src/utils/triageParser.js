'use strict';

const ALLOWED_URGENCY = ['routine', 'soon', 'urgent', 'emergency'];
const TRIAGE_RE = /<triage>([\s\S]*?)<\/triage>/;

/**
 * Parses a <triage>{JSON}</triage> block from a Claude response string.
 *
 * Returns null when:
 * - input is not a string
 * - no <triage> block is present
 * - JSON inside the block is malformed
 * - urgency value is not in ALLOWED_URGENCY
 *
 * @param {string} text - full Claude response text
 * @returns {{ urgency: string, specialties: string[], summary: string, ready_for_referral: boolean } | null}
 */
function parseTriage(text) {
  if (typeof text !== 'string') return null;

  const match = text.match(TRIAGE_RE);
  if (!match) return null;

  let parsed;
  try {
    parsed = JSON.parse(match[1].trim());
  } catch {
    return null;
  }

  // Validate urgency — unknown values return null (safety gate)
  if (!ALLOWED_URGENCY.includes(parsed.urgency)) return null;

  // Filter specialties to string values only; cap at 5 entries
  const specialties = Array.isArray(parsed.specialties)
    ? parsed.specialties.filter(s => typeof s === 'string').slice(0, 5)
    : [];

  return {
    urgency: parsed.urgency,
    specialties,
    summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 500) : '',
    chief_complaint: typeof parsed.chief_complaint === 'string' ? parsed.chief_complaint.slice(0, 800) : null,
    ready_for_referral: parsed.ready_for_referral === true,
  };
}

module.exports = { parseTriage, ALLOWED_URGENCY };
