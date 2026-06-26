# Doctor Reviews & Ratings — Design Spec

**Date:** 2026-06-26
**Phase:** 2A
**Status:** Approved

---

## Overview

Patients can rate and review their doctor after a validated appointment. Ratings are public on the doctor's profile. Doctors can flag abusive reviews for admin moderation. One review per appointment, 7-day submission window.

---

## Data Models

### `Review` (new collection)

| Field | Type | Notes |
|---|---|---|
| `appointmentId` | ref Appointment | unique index — one review per appointment |
| `patientId` | ref User | resolved from `req.user.id` |
| `doctorId` | ref User | resolved from appointment — never from body |
| `rating` | Number | 1–5, required |
| `comment` | String | optional, max 1000 chars |
| `flagged` | Boolean | default false |
| `flagReason` | String | optional, set by doctor on flag |
| `createdAt` | Date | |

Indexes:
- `{ appointmentId: 1 }` — unique
- `{ doctorId: 1, createdAt: -1 }` — for paginated list

### `Doctor` model — add fields

```js
averageRating: { type: Number, default: 0 }
reviewCount:   { type: Number, default: 0 }
```

Updated atomically after every review create/delete via MongoDB `$avg` pipeline.

---

## API Endpoints

### `POST /api/reviews`

**Access:** Patient only

**Body:**
```json
{ "appointmentId": "...", "rating": 4, "comment": "..." }
```

**Server-side checks (in order):**
1. `appointment` exists and `status === 'validated'`
2. `appointment.patientId === req.user.id`
3. `appointment.updatedAt` is within 7 days of now
4. No existing `Review` for this `appointmentId` (unique index guard)

**On success:**
- Creates `Review` with `doctorId` from appointment
- Recalculates `Doctor.averageRating` and `Doctor.reviewCount` atomically

**Response:** `201 { review }`

---

### `GET /api/doctors/:id/reviews`

**Access:** Public (no auth required)

**Query params:** `?page=1` (20 per page, cursor-based)

**Response:**
```json
{
  "reviews": [...],
  "averageRating": 4.6,
  "reviewCount": 38,
  "page": 1,
  "totalPages": 2
}
```

---

### `PATCH /api/reviews/:id/flag`

**Access:** Doctor — must be the `doctorId` of the review

**Body:** `{ "flagReason": "..." }` (optional)

**Action:** Sets `flagged: true`, saves `flagReason`

**Response:** `200 { review }`

---

### `DELETE /api/admin/reviews/:id`

**Access:** Admin only

**Condition:** Review should be flagged (checked server-side, returns 409 if not flagged)

**On success:**
- Deletes review
- Recalculates `Doctor.averageRating` and `Doctor.reviewCount`

**Response:** `204`

---

## Authorization Rules

| Action | Role | Condition |
|---|---|---|
| Submit review | patient | validated appointment, own patient, 7-day window, no prior review |
| Read reviews | public | none |
| Flag review | doctor | `review.doctorId === req.user.id` |
| Delete review | admin | review is flagged |

---

## Rating Recalculation

After any review create or delete, recalculate atomically:

```js
const result = await Review.aggregate([
  { $match: { doctorId } },
  { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
]);
const { avg = 0, count = 0 } = result[0] || {};
await Doctor.findOneAndUpdate({ userId: doctorId }, {
  averageRating: Math.round(avg * 10) / 10,
  reviewCount: count,
});
```

---

## Mobile Screens

### Patient

**`WriteReviewScreen`**
- Accessible from `MyAppointmentsScreen` — "Laisser un avis" badge on validated appointments within 7-day window
- Star selector (1–5, tap to select)
- Optional comment field (max 1000 chars, char counter)
- Submit button with loading state
- On success: navigates back, badge disappears

**`DoctorProfileScreen`** (extend existing)
- Add: average rating stars + score + review count in header
- Add: last 5 reviews section (reviewer first name + initial, rating, comment, date)

**`MyAppointmentsScreen`** (extend existing)
- Badge "⭐ Laisser un avis" on eligible appointments (validated + < 7 days + no review yet)

### Doctor

**`ReviewsScreen`** (new)
- Header: large average rating + star display + total count
- List: paginated reviews with rating, comment, date, "Signaler" button
- Flag modal: optional reason field + confirm

**`DashboardScreen`** (extend)
- Add rating widget: average stars + count + link to ReviewsScreen

### Shared

**Navigation:**
- Doctor: add `ReviewsScreen` to `DoctorTabs` stack (push from Dashboard widget)
- Patient: add `WriteReviewScreen` to `PatientTabs` stack (push from MyAppointments)

---

## Web Pages

### Patient

**`MyAppointmentsPage`** (extend)
- "Laisser un avis" button on eligible appointments → opens inline modal
- Modal: star picker + textarea + submit

### Doctor

**`DashboardPage`** (extend)
- Rating widget: average stars + count + "Voir tous les avis" link

**`ReviewsPage`** (new)
- Paginated list of own reviews
- "Signaler" button per review → confirm dialog with optional reason

**Sidebar** (extend)
- Add "Mes avis ⭐" nav link for doctor role

### Public

**`DoctorProfilePage`** (extend)
- Average rating + star display in header (visible without login)
- Paginated reviews section

---

## Security Considerations

- `patientId` always from `req.user.id` — never from request body
- `doctorId` always resolved from the appointment — never from request body
- 7-day window enforced server-side on `appointment.updatedAt`
- Unique index on `appointmentId` prevents race-condition double submissions
- Comment sanitized (length cap 1000, XSS strip via express-validator `escape()`)
- Flagged reviews remain visible until admin deletes — prevents doctor abuse of flag system
- Rating recalculation is atomic — no stale average possible

---

## Failure Scenarios

| Scenario | Behavior |
|---|---|
| Patient submits after 7-day window | `409` with message "Review window has closed" |
| Patient submits twice for same appointment | `409` from unique index |
| Doctor flags own review | `403` — `review.doctorId === req.user.id` required |
| Rating recalculation fails | Log error, return success to client — background retry acceptable |
| Admin deletes non-flagged review | `409` — must be flagged first |
