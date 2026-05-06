import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import AppLayout from '../components/layout/AppLayout';

import LoginPage       from '../pages/auth/LoginPage';
import RegisterPage    from '../pages/auth/RegisterPage';
import DashboardPage   from '../pages/doctor/DashboardPage';
import AppointmentsPage from '../pages/doctor/AppointmentsPage';
import PatientRecordsPage from '../pages/doctor/PatientRecordsPage';
import PrescriptionsPage from '../pages/doctor/PrescriptionsPage';
import FindDoctorPage  from '../pages/patient/FindDoctorPage';
import MyAppointmentsPage from '../pages/patient/MyAppointmentsPage';
import MedicalRecordsPage from '../pages/patient/MedicalRecordsPage';

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
        <Route path="/dashboard"    element={<Protected role="doctor"><DashboardPage /></Protected>} />
        <Route path="/appointments" element={<Protected role="doctor"><AppointmentsPage /></Protected>} />
        <Route path="/patients"     element={<Protected role="doctor"><PatientRecordsPage /></Protected>} />
        <Route path="/prescriptions" element={<Protected role="doctor"><PrescriptionsPage /></Protected>} />

        {/* Patient routes */}
        <Route path="/find-doctor"     element={<Protected role="patient"><FindDoctorPage /></Protected>} />
        <Route path="/my-appointments" element={<Protected role="patient"><MyAppointmentsPage /></Protected>} />
        <Route path="/records"         element={<Protected role="patient"><MedicalRecordsPage /></Protected>} />

        {/* Root redirect */}
        <Route path="/" element={
          !user ? <Navigate to="/login" /> :
          user.role === 'doctor' ? <Navigate to="/dashboard" /> :
          <Navigate to="/find-doctor" />
        } />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
