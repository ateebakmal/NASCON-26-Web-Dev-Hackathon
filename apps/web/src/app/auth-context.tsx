import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { loginSchema, signupSchema, type LoginDto, type SignupDto } from "@ubp/shared";
import { api, ApiError } from "../lib/api";

interface MeResponse {
  id: string;
  name: string;
  email: string;
  baseRole: "OWNER" | "ADMIN" | "USER";
  workspaceId: string;
  workspace: { name: string };
  permissionSet: { id: string; name: string } | null;
}

interface AuthContextValue {
  user: MeResponse | null | undefined; // undefined = still loading
  isLoading: boolean;
  login: (dto: LoginDto) => Promise<void>;
  signup: (dto: SignupDto) => Promise<void>;
  logout: () => Promise<void>;
  loginError: string | null;
  signupError: string | null;
  /** True when the API itself is unreachable, as opposed to being logged out. */
  serverUnreachable: boolean;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api.get<MeResponse>("/auth/me"),
    // A 401 here just means "not logged in" and is expected on first load, so
    // it must not be retried. A network failure is worth one retry in case
    // the API is mid-restart.
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 0 && failureCount < 2,
  });

  const serverUnreachable =
    meQuery.error instanceof ApiError && meQuery.error.status === 0;

  const loginMutation = useMutation({
    mutationFn: (dto: LoginDto) => api.post<{ user: MeResponse }>("/auth/login", loginSchema.parse(dto)),
    onSuccess: (data) => queryClient.setQueryData(["auth", "me"], data.user),
  });

  const signupMutation = useMutation({
    mutationFn: (dto: SignupDto) => api.post<{ user: MeResponse }>("/auth/signup", signupSchema.parse(dto)),
    onSuccess: (data) => queryClient.setQueryData(["auth", "me"], data.user),
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: () => {
      queryClient.setQueryData(["auth", "me"], null);
      queryClient.clear();
    },
  });

  const value: AuthContextValue = {
    user: meQuery.isLoading ? undefined : (meQuery.data ?? null),
    isLoading: meQuery.isLoading,
    login: async (dto) => {
      await loginMutation.mutateAsync(dto);
    },
    signup: async (dto) => {
      await signupMutation.mutateAsync(dto);
    },
    logout: async () => {
      await logoutMutation.mutateAsync();
    },
    loginError: loginMutation.error ? errorMessage(loginMutation.error) : null,
    signupError: signupMutation.error ? errorMessage(signupMutation.error) : null,
    serverUnreachable,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
