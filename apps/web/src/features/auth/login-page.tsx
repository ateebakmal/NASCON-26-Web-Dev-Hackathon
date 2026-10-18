import * as React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../app/auth-context";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";

export function LoginPage() {
  const { login, loginError } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login({ email, password });
    } catch {
      /* surfaced via loginError */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Access your workspace</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
            <label className="flex flex-col gap-1 text-sm text-text/70">
              Email
              <Input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-text/70">
              Password
              <Input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {loginError && (
              <p role="alert" className="text-sm text-danger">
                {loginError}
              </p>
            )}
            <Button type="submit" loading={submitting} className="mt-2">
              Sign in
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-text/60">
            New company?{" "}
            <Link to="/signup" className="text-primary underline-offset-2 hover:underline">
              Create a workspace
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
