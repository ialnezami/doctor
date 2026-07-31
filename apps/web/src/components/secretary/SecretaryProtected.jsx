import { Navigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import SecretaryLayout from '../../layouts/SecretaryLayout';

/**
 * Route guard for secretary-only pages.
 * Redirects unauthenticated users to /login.
 * Redirects authenticated non-secretary users to /.
 */
export default function SecretaryProtected({ children }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'secretary') return <Navigate to="/" replace />;
  return <SecretaryLayout>{children}</SecretaryLayout>;
}
