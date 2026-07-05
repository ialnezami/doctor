import { useState } from 'react';
import { Outlet } from 'react-router-dom';
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
 *
 * patientLocation: TODO — wire from user profile geolocation or browser
 * navigator.geolocation once the feature is available. Currently null (optional).
 */
export default function PatientLayout({ children }) {
  const [chatOpen, setChatOpen] = useState(false);

  // TODO: replace null with real geolocation (user profile coords or browser API)
  const patientLocation = null;

  return (
    <>
      {children ?? <Outlet />}
      <ChatFloatingBubble
        onClick={() => setChatOpen((prev) => !prev)}
        isOpen={chatOpen}
      />
      <ChatWidget
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        patientLocation={patientLocation}
      />
    </>
  );
}
