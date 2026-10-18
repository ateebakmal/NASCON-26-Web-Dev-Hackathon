import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth-context";
import { useRealtimeLeadEvents } from "../lib/use-realtime";
import { Layout } from "./layout";
import { LoginPage } from "../features/auth/login-page";
import { SignupPage } from "../features/auth/signup-page";
import { DashboardPage } from "../features/dashboard/dashboard-page";
import { DealsPage } from "../features/deals/deals-page";
import { ContactsPage } from "../features/contacts/contacts-page";
import { ContactDetailPage } from "../features/contacts/contact-detail-page";
import { LeadsPage } from "../features/leads/leads-page";
import { RecoveryQueuePage } from "../features/recovery-queue/recovery-queue-page";
import { EmployeeStatusPage } from "../features/employee-status/employee-status-page";
import { PermissionSetsPage } from "../features/permissions/permission-sets-page";
import { SettingsPage } from "../features/settings/settings-page";

export function App() {
  const { user, isLoading, serverUnreachable } = useAuth();
  const { connected } = useRealtimeLeadEvents(Boolean(user));

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-text-muted">Loading…</div>
    );
  }

  if (serverUnreachable) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-lg font-semibold text-text">Can't reach the server</p>
        <p className="max-w-sm text-base text-text-muted">
          The API isn't responding. Start it with{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">pnpm dev:api</code>, then
          reload.
        </p>
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
      <Route element={<Layout liveConnected={connected} />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/deals" element={<DealsPage />} />
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/contacts/:id" element={<ContactDetailPage />} />
        <Route path="/leads" element={<LeadsPage />} />
        <Route path="/recovery-queue" element={<RecoveryQueuePage />} />
        <Route path="/employees" element={<EmployeeStatusPage />} />
        <Route path="/permission-sets" element={<PermissionSetsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
