/**
 * DoctorRecommendationCard — compact clickable card for a recommended doctor.
 *
 * Doctor shape (from SSE 'done' event or /api/chatbot/doctors):
 *   { _id, specialty, photoUrl, averageRating, reviewCount, consultationFee,
 *     distMeters, user: { name }, locations: [...] }
 *
 * Props:
 *   doctor    — doctor object
 *   onSelect  — (doctorId: string) => void — called on click/enter
 */
export default function DoctorRecommendationCard({ doctor, onSelect }) {
  const name = doctor?.user?.name ?? 'Unknown Doctor';
  const specialty = doctor?.specialty ?? '';
  const distKm =
    typeof doctor?.distMeters === 'number'
      ? (doctor.distMeters / 1000).toFixed(1)
      : null;
  const rating = doctor?.averageRating != null ? Number(doctor.averageRating).toFixed(1) : null;
  const reviewCount = doctor?.reviewCount ?? 0;
  const fee = doctor?.consultationFee;
  const photoUrl = doctor?.photoUrl;

  // Initials fallback when no photo
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  const cardStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    padding: '10px 12px',
    marginBottom: 8,
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    cursor: 'pointer',
    textAlign: 'left',
    // Reset button defaults
    fontFamily: 'inherit',
    fontSize: 14,
    color: '#111827',
  };

  const avatarStyle = {
    width: 44,
    height: 44,
    borderRadius: '50%',
    backgroundColor: '#2563eb',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 15,
    flexShrink: 0,
    overflow: 'hidden',
  };

  return (
    <button
      style={cardStyle}
      onClick={() => onSelect(doctor._id)}
      aria-label={`View doctor ${name}`}
    >
      <div style={avatarStyle}>
        {photoUrl ? (
          <img src={photoUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          initials
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {name}
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
          {specialty}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap', fontSize: 12, color: '#6b7280' }}>
          {rating != null && (
            <span>&#9733; {rating} ({reviewCount})</span>
          )}
          {distKm != null && (
            <span>{distKm} km away</span>
          )}
          {fee != null && (
            <span>${fee}</span>
          )}
        </div>
      </div>

      <span style={{ color: '#9ca3af', fontSize: 18, flexShrink: 0 }}>›</span>
    </button>
  );
}
