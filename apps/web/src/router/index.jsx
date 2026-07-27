import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import AppLayout from '../components/layout/AppLayout';
import DoctorLayout from '../components/layout/DoctorLayout';

import LoginPage          from '../pages/auth/LoginPage';
import RegisterPage       from '../pages/auth/RegisterPage';
import TodayPage          from '../pages/doctor/TodayPage';
import DashboardPage      from '../pages/doctor/DashboardPage';
import AppointmentsPage   from '../pages/doctor/AppointmentsPage';
import PatientRecordsPage  from '../pages/doctor/PatientRecordsPage';
import PatientDetailPage   from '../pages/doctor/PatientDetailPage';
import PrescriptionsPage  from '../pages/doctor/PrescriptionsPage';
import LabResultsPage     from '../pages/doctor/LabResultsPage';
import DoctorSettingsPage from '../pages/doctor/DoctorSettingsPage';
import ComingSoonPage     from '../pages/doctor/ComingSoonPage';
import InvoicesPage       from '../pages/doctor/InvoicesPage';
import ServicesPage      from '../pages/doctor/ServicesPage';
import FindDoctorPage     from '../pages/patient/FindDoctorPage';
import DoctorProfilePage  from '../pages/patient/DoctorProfilePage';
import BookAppointmentPage from '../pages/patient/BookAppointmentPage';
import BookConfirmedPage  from '../pages/patient/BookConfirmedPage';
import MyAppointmentsPage from '../pages/patient/MyAppointmentsPage';
import MedicalRecordsPage from '../pages/patient/MedicalRecordsPage';
import PatientSettingsPage from '../pages/patient/PatientSettingsPage';
import ReviewsPage        from '../pages/doctor/ReviewsPage';
import ReportsPage        from '../pages/doctor/ReportsPage';
import LabDashboardPage      from '../pages/lab/LabDashboardPage';
import PharmacyDashboardPage from '../pages/pharmacy/PharmacyDashboardPage';
import ShareViewerPage         from '../pages/public/ShareViewerPage';
import RxVerifyPage            from '../pages/public/RxVerifyPage';
import DoctorPublicProfilePage from '../pages/public/DoctorPublicProfilePage';
import DownloadPage            from '../pages/public/DownloadPage';
import ChatPage           from '../pages/shared/ChatPage';
import VideoCallPage      from '../pages/shared/VideoCallPage';
import AdminLoginPage from '../pages/admin/AdminLoginPage';
import AdminPage      from '../pages/admin/AdminPage';

function Protected({ children, role }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function DoctorProtected({ children }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'doctor') return <Navigate to="/" replace />;
  return <DoctorLayout>{children}</DoctorLayout>;
}

export default function AppRouter() {
  const { user } = useAuthStore();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"    element={user ? <Navigate to="/" /> : <LoginPage />} />
        <Route path="/register" element={user ? <Navigate to="/" /> : <RegisterPage />} />

        {/* Doctor routes — DoctorLayout (RTL, teal shell) */}
        <Route path="/today"         element={<DoctorProtected><TodayPage /></DoctorProtected>} />
        <Route path="/dashboard"     element={<Navigate to="/today" replace />} />
        <Route path="/appointments"  element={<DoctorProtected><AppointmentsPage /></DoctorProtected>} />
        <Route path="/appointments/:id" element={<DoctorProtected><AppointmentsPage /></DoctorProtected>} />
        <Route path="/appointments/:id/video" element={<DoctorProtected><VideoCallPage /></DoctorProtected>} />
        <Route path="/appointments/:id/chat"  element={<DoctorProtected><ChatPage /></DoctorProtected>} />
        <Route path="/patients"         element={<DoctorProtected><PatientRecordsPage /></DoctorProtected>} />
        <Route path="/patients/:userId" element={<DoctorProtected><PatientDetailPage /></DoctorProtected>} />
        <Route path="/prescriptions"    element={<DoctorProtected><PrescriptionsPage /></DoctorProtected>} />
        <Route path="/lab-results"      element={<DoctorProtected><LabResultsPage /></DoctorProtected>} />
        <Route path="/settings"         element={<DoctorProtected><DoctorSettingsPage /></DoctorProtected>} />
        <Route path="/reviews"          element={<DoctorProtected><ReviewsPage /></DoctorProtected>} />
        <Route path="/lab-board"        element={<DoctorProtected><ComingSoonPage /></DoctorProtected>} />
        <Route path="/waiting-room"     element={<DoctorProtected><ComingSoonPage /></DoctorProtected>} />
        <Route path="/services"         element={<DoctorProtected><ServicesPage /></DoctorProtected>} />
        <Route path="/invoices"         element={<DoctorProtected><InvoicesPage /></DoctorProtected>} />
        <Route path="/reports"          element={<DoctorProtected><ReportsPage /></DoctorProtected>} />
        <Route path="/staff"            element={<DoctorProtected><ComingSoonPage /></DoctorProtected>} />
        <Route path="/clinic"           element={<DoctorProtected><ComingSoonPage /></DoctorProtected>} />
        <Route path="/schedule"         element={<DoctorProtected><ComingSoonPage /></DoctorProtected>} />
        <Route path="/feedback"         element={<DoctorProtected><ComingSoonPage /></DoctorProtected>} />
        <Route path="/help"             element={<DoctorProtected><ComingSoonPage /></DoctorProtected>} />

        {/* Patient routes */}
        <Route path="/find-doctor"     element={<Protected role="patient"><FindDoctorPage /></Protected>} />
        <Route path="/doctor/:id"      element={<Protected role="patient"><DoctorProfilePage /></Protected>} />
        <Route path="/book/:doctorId"  element={<Protected role="patient"><BookAppointmentPage /></Protected>} />
        <Route path="/book/confirmed"  element={<Protected role="patient"><BookConfirmedPage /></Protected>} />
        <Route path="/my-appointments" element={<Protected role="patient"><MyAppointmentsPage /></Protected>} />
        <Route path="/records"         element={<Protected role="patient"><MedicalRecordsPage /></Protected>} />
        <Route path="/my-appointments/:id/video" element={<Protected role="patient"><VideoCallPage /></Protected>} />
        <Route path="/my-appointments/:id/chat" element={<Protected role="patient"><ChatPage /></Protected>} />
        <Route path="/patient-settings" element={<Protected role="patient"><PatientSettingsPage /></Protected>} />

        {/* Lab routes */}
        <Route path="/lab" element={<Protected role="laboratory"><LabDashboardPage /></Protected>} />

        {/* Pharmacy routes */}
        <Route path="/pharmacy" element={<Protected role="pharmacy"><PharmacyDashboardPage /></Protected>} />

        {/* Public */}
        <Route path="/dr/:id"    element={<DoctorPublicProfilePage />} />
        <Route path="/s/:token"  element={<ShareViewerPage />} />
        <Route path="/rx/:token" element={<RxVerifyPage />} />
        <Route path="/download"  element={<DownloadPage />} />

        {/* Admin routes */}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminPage />} />

        {/* Root redirect */}
        <Route path="/" element={
          !user ? <Navigate to="/login" /> :
          user.role === 'doctor' ? <Navigate to="/today" /> :
          user.role === 'laboratory' ? <Navigate to="/lab" /> :
          user.role === 'pharmacy'   ? <Navigate to="/pharmacy" /> :
          <Navigate to="/find-doctor" />
        } />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
