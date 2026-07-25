import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import ChatFloatingBubble from '../../components/patient/ChatFloatingBubble';
import ChatWidget from '../../components/patient/ChatWidget';

/**
 * PatientLayout — layout wrapper for all patient routes.
 *
 * Renders child routes via <Outlet> (React Router v6 layout pattern) and
 * mounts the AI chat bubble + sliding widget at the layout level so they
 * persist across page navigations without losing conversation state.
 *
 * Integration note: This layout is currently registered in AppLayout for
 * patient-role users rather than as a direct router Outlet wrapper, to avoid
 * restructuring the entire route tree. See apps/web/src/components/layout/AppLayout.jsx.
 */
export default function PatientLayout({ children }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [patientLocation, setPatientLocation] = useState(null);
  const { pathname } = useLocation();
  const hideBubble = pathname.startsWith('/chat');

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        setPatientLocation({ lat: coords.latitude, lng: coords.longitude }),
      () => { /* denied or timed out — chat works without geo ranking */ },
      { timeout: 10000, maximumAge: 300_000 }
    );
  }, []);

  return (
    <>
      {children ?? <Outlet />}
      {!hideBubble && (
        <ChatFloatingBubble
          onClick={() => setChatOpen((prev) => !prev)}
          isOpen={chatOpen}
        />
      )}
      <ChatWidget
        isOpen={chatOpen && !hideBubble}
        onClose={() => setChatOpen(false)}
        patientLocation={patientLocation}
      />
    </>
  );
}
