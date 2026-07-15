# Design: Chatbot Booking — Wire Geolocation (Web) + Bottom Sheet (Mobile)

**Date:** 2026-07-15  
**Status:** Approved  
**Scope:** `PatientLayout.jsx` (web) + `ChatbotScreen.js` + new `ChatMobileBookingSheet.js` (mobile)

---

## Context

The AI chatbot + booking infrastructure is already fully implemented. Two gaps prevent end-to-end booking through the chatbot:

1. **Web:** `PatientLayout` passes `patientLocation: null` to `ChatWidget` (hardcoded TODO), so the chatbot cannot do geo-ranked doctor search.
2. **Mobile:** `ChatbotScreen` renders doctor recommendation cards but tapping "Book" does nothing — there is no inline booking flow on mobile.

---

## Fix 1 — Web: Wire Geolocation into `PatientLayout`

**File:** `apps/web/src/pages/patient/PatientLayout.jsx`

On mount, call `navigator.geolocation.getCurrentPosition` with a 10-second timeout. Store the result in `patientLocation` state (`{ lat, lng } | null`). Pass it to `ChatWidget`.

```
mount → navigator.geolocation.getCurrentPosition
  success → setPatientLocation({ lat, lng })
  error / unsupported → patientLocation stays null (chat works, no geo ranking)
```

**Failure modes:**
- Geolocation denied → silent fail, `patientLocation` stays `null`
- Geolocation timeout (10s) → silent fail
- Browser doesn't support geolocation → guard with `if (navigator.geolocation)`
- No UI shown for any of these — geolocation is a silent enhancement

**What this unlocks:** `ChatWidget` → `useChatbotStream({ lat, lng })` → `POST /api/chatbot/message` with coordinates → AI returns geo-ranked doctor recommendations.

---

## Fix 2 — Mobile: `ChatMobileBookingSheet`

**New file:** `apps/mobile/src/components/ChatMobileBookingSheet.js`  
**Modified:** `apps/mobile/src/screens/patient/ChatbotScreen.js`

### Component contract

```js
<ChatMobileBookingSheet
  doctor={doctor}        // doctor object from chatbot 'done' event
  visible={boolean}      // controls sheet visibility
  onDone={(msg) => void} // called with success string; parent appends to chat
  onCancel={() => void}  // dismisses sheet
/>
```

### Sheet content (top to bottom)

1. **Header row:** "Book with Dr. [Name]" + ✕ button
2. **Location picker:** `<Picker>` or segmented buttons — only shown when doctor has >1 bookable location
3. **Date chips:** horizontal `ScrollView` of next 7 days (today+1 through today+7), pill-shaped buttons
4. **Slot grid:** fetched from `GET /doctors/:id/available-slots?date=YYYY-MM-DD&locationId=` — shown after date selected; filters `available: true`; loading spinner while fetching; "No slots on this date" if empty
5. **Confirm button:** disabled until slot selected; shows "Booking…" while in-flight; calls `POST /appointments`
6. **Error text:** shown below confirm if booking fails

### Animation

Slide-up using `Animated.Value` — same pattern as `FindDoctorScreen`'s map sheet:
- `toValue: 0` (visible) / `toValue: SHEET_HEIGHT` (hidden)
- `duration: 280ms` on open, `220ms` on close
- Semi-transparent backdrop (`TouchableOpacity` that calls `onCancel`)

### API calls (mobile)

Both functions already exist in `apps/web/src/api/chatbot.js` and must be replicated in the mobile API layer at `apps/mobile/src/api/chatbot.js` (or equivalent):

```js
// GET /doctors/:id/available-slots?date=YYYY-MM-DD&locationId=
fetchDoctorSlots(doctorId, date, locationId)

// POST /appointments
bookFromChat({ doctorUserId, locationId, date, timeSlot, reason })
```

### ChatbotScreen wiring

Add `bookingDoctor` state (`null | doctor object`). Pass `onBook={setBookingDoctor}` to each `DoctorRecommendationCard`. Render `ChatMobileBookingSheet` when `bookingDoctor` is set:

```jsx
<ChatMobileBookingSheet
  doctor={bookingDoctor}
  visible={!!bookingDoctor}
  onDone={(msg) => { setBookingDoctor(null); /* append msg to chat */ }}
  onCancel={() => setBookingDoctor(null)}
/>
```

**Appending the success message to chat:** The `useChatbotStream` hook's `send` function sends a user message to the API. For a booking confirmation we want to append a local assistant-style message without an API call. Add a `appendLocal(msg)` function to the hook that pushes a `{ role: 'assistant', content: msg, id: uuid }` into `messages` state directly.

---

## What Is Not Changing

- `ChatWidget`, `ChatBookingFlow`, `useChatbotStream` (web) — untouched
- `chatbotService.js`, chatbot API routes — untouched
- `DoctorRecommendationCard` on mobile — may need `onBook` prop added if missing; otherwise untouched
- Booking API endpoint `POST /appointments` — untouched

---

## Files Modified / Created

| File | Change |
|---|---|
| `apps/web/src/pages/patient/PatientLayout.jsx` | Wire `navigator.geolocation` → `patientLocation` state |
| `apps/mobile/src/components/ChatMobileBookingSheet.js` | New — bottom sheet booking UI |
| `apps/mobile/src/api/chatbot.js` | Add `fetchDoctorSlots` + `bookFromChat` (if not present) |
| `apps/mobile/src/hooks/useChatbotStream.js` | Add `appendLocal(msg)` to returned interface |
| `apps/mobile/src/screens/patient/ChatbotScreen.js` | Wire `bookingDoctor` state + render sheet |
| `apps/mobile/src/components/DoctorRecommendationCard.js` | Add `onBook` prop if missing |
