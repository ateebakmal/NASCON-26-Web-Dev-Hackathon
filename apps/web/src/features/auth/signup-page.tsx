import * as React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../app/auth-context";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";

// This doubles as the "WorkspaceSetupWizard": signing up IS creating a new
// workspace with this user as its Owner (F1.1).
export function SignupPage() {
  const { signup, signupError } = useAuth();
  const [workspaceName, setWorkspaceName] = React.useState("");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await signup({ workspaceName, name, email, password });
    } catch {
      /* surfaced via signupError */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create your workspace</CardTitle>
          <CardDescription>You'll be the Owner of this company's workspace</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
            <label className="flex flex-col gap-1 text-sm text-text-muted">
              Company / workspace name
              <Input required minLength={2} value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-text-muted">
              Your name
              <Input required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-text-muted">
              Email
              <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-text-muted">
              Password
              <Input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {signupError && (
              <p role="alert" className="text-sm text-danger">
                {signupError}
              </p>
            )}
            <Button type="submit" loading={submitting} className="mt-2">
              Create workspace
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-text-muted">
            Already have an account?{" "}
            <Link to="/login" className="text-primary underline-offset-2 hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
