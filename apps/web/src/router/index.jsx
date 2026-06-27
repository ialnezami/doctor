import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import AppLayout from '../components/layout/AppLayout';

import LoginPage          from '../pages/auth/LoginPage';
import RegisterPage       from '../pages/auth/RegisterPage';
import DashboardPage      from '../pages/doctor/DashboardPage';
import AppointmentsPage   from '../pages/doctor/AppointmentsPage';
import PatientRecordsPage from '../pages/doctor/PatientRecordsPage';
import PrescriptionsPage  from '../pages/doctor/PrescriptionsPage';
import LabResultsPage     from '../pages/doctor/LabResultsPage';
import DoctorSettingsPage from '../pages/doctor/DoctorSettingsPage';
import FindDoctorPage     from '../pages/patient/FindDoctorPage';
import DoctorProfilePage  from '../pages/patient/DoctorProfilePage';
import BookAppointmentPage from '../pages/patient/BookAppointmentPage';
import BookConfirmedPage  from '../pages/patient/BookConfirmedPage';
import MyAppointmentsPage from '../pages/patient/MyAppointmentsPage';
import MedicalRecordsPage from '../pages/patient/MedicalRecordsPage';
import PatientSettingsPage from '../pages/patient/PatientSettingsPage';
import ReviewsPage        from '../pages/doctor/ReviewsPage';
import LabDashboardPage   from '../pages/lab/LabDashboardPage';
import ShareViewerPage    from '../pages/public/ShareViewerPage';
import ChatPage           from '../pages/shared/ChatPage';
import VideoCallPage      from '../pages/shared/VideoCallPage';

function Protected({ children, role }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return <AppLayout>{children}</AppLayout>;
}

export default function AppRouter() {
  const { user } = useAuthStore();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"    element={user ? <Navigate to="/" /> : <LoginPage />} />
        <Route path="/register" element={user ? <Navigate to="/" /> : <RegisterPage />} />

        {/* Doctor routes */}
        <Route path="/dashboard"     element={<Protected role="doctor"><DashboardPage /></Protected>} />
        <Route path="/appointments"  element={<Protected role="doctor"><AppointmentsPage /></Protected>} />
        <Route path="/patients"      element={<Protected role="doctor"><PatientRecordsPage /></Protected>} />
        <Route path="/prescriptions" element={<Protected role="doctor"><PrescriptionsPage /></Protected>} />
        <Route path="/lab-results"   element={<Protected role="doctor"><LabResultsPage /></Protected>} />
        <Route path="/settings"      element={<Protected role="doctor"><DoctorSettingsPage /></Protected>} />
        <Route path="/reviews"       element={<Protected role="doctor"><ReviewsPage /></Protected>} />
        <Route path="/appointments/:id/video" element={<Protected role="doctor"><VideoCallPage /></Protected>} />
        <Route path="/appointments/:id/chat" element={<Protected role="doctor"><ChatPage /></Protected>} />

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

        {/* Public */}
        <Route path="/s/:token" element={<ShareViewerPage />} />

        {/* Root redirect */}
        <Route path="/" element={
          !user ? <Navigate to="/login" /> :
          user.role === 'doctor' ? <Navigate to="/dashboard" /> :
          user.role === 'laboratory' ? <Navigate to="/lab" /> :
          <Navigate to="/find-doctor" />
        } />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
