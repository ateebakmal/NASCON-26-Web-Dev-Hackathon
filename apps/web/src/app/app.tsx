import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth-context";
import { useRealtimeLeadEvents } from "../lib/use-realtime";
import { Layout } from "./layout";
import { LoginPage } from "../features/auth/login-page";
import { SignupPage } from "../features/auth/signup-page";
import { LeadsPage } from "../features/leads/leads-page";
import { RecoveryQueuePage } from "../features/recovery-queue/recovery-queue-page";
import { EmployeeStatusPage } from "../features/employee-status/employee-status-page";
import { PermissionSetsPage } from "../features/permissions/permission-sets-page";

export function App() {
  const { user, isLoading } = useAuth();
  useRealtimeLeadEvents(Boolean(user));

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-text/60">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/leads" replace />} />
        <Route path="/leads" element={<LeadsPage />} />
        <Route path="/recovery-queue" element={<RecoveryQueuePage />} />
        <Route path="/employees" element={<EmployeeStatusPage />} />
        <Route path="/permission-sets" element={<PermissionSetsPage />} />
        <Route path="*" element={<Navigate to="/leads" replace />} />
      </Route>
    </Routes>
  );
}
