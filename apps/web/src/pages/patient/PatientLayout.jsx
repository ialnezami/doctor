import { Outlet } from 'react-router-dom';
// import { useState, useEffect } from 'react';
// import { useLocation } from 'react-router-dom';
// import ChatFloatingBubble from '../../components/patient/ChatFloatingBubble';
// import ChatWidget from '../../components/patient/ChatWidget';

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
  return <>{children ?? <Outlet />}</>;

  /* AI chat bubble + widget — disabled until backend AI key is configured
  const [chatOpen, setChatOpen] = useState(false);
  const [patientLocation, setPatientLocation] = useState(null);
  const { pathname } = useLocation();
  const hideBubble = pathname.startsWith('/chat');

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        setPatientLocation({ lat: coords.latitude, lng: coords.longitude }),
      () => {},
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
  */
}
