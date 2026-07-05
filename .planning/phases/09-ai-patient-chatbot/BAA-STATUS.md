# Anthropic BAA Status — Phase 9 Chatbot Compliance Gate

**Status:** UNKNOWN — MUST BE RESOLVED BEFORE PRODUCTION LAUNCH
**Owner:** ibrahim.alnezami@gmail.com
**Blocking:** Phase 9 production deployment (Wave 4 verification gate)

## Why This Matters

Phase 9 sends patient symptom descriptions to Anthropic's Claude API. Symptom text is Protected Health Information (PHI) under HIPAA. Processing PHI via a third-party requires a signed Business Associate Agreement (BAA).

## Actions Required

- [ ] Confirm whether the project's Anthropic account has an active BAA
- [ ] If not: contact Anthropic Enterprise sales to initiate BAA
- [ ] Record BAA signed date + Anthropic contact here once complete
- [ ] Update this file to `Status: SIGNED` before enabling the chatbot in production

## Interim Mitigation (Dev / Staging Only)

- Chatbot MAY be tested with synthetic (non-real-patient) symptom data pre-BAA
- Production environment gate: check this file before Wave 4 verification passes

## References

- RESEARCH: .planning/phases/09-ai-patient-chatbot/09-RESEARCH.md#pitfall-7-anthropic-baa-not-signed
- anthropic.com/healthcare
