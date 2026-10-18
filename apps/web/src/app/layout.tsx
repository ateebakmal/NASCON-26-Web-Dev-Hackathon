import * as React from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Bell,
  ChevronRight,
  ChevronsUpDown,
  LayoutGrid,
  LifeBuoy,
  ListChecks,
  Mail,
  PanelLeft,
  Search,
  Settings,
  Share2,
  Shield,
  Sun,
  Target,
  Users2,
  WifiOff,
  Workflow,
} from "lucide-react";
import { useAuth } from "./auth-context";
import { cn } from "../lib/utils";

const NAV_PRIMARY = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { to: "/deals", label: "Deals", icon: Target },
  { to: "/contacts", label: "Contacts", icon: Users2 },
  { to: "/leads", label: "My Leads", icon: Mail },
  { to: "/recovery-queue", label: "Recovery Queue", icon: ListChecks },
];

const NAV_SECONDARY = [
  { to: "/employees", label: "Team", icon: Workflow },
  { to: "/permission-sets", label: "Roles", icon: Shield },
  { to: "/settings", label: "Pipelines & Fields", icon: Settings },
];

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/deals": "Deals",
  "/contacts": "Contacts",
  "/leads": "My Leads",
  "/recovery-queue": "Recovery Queue",
  "/employees": "Team",
  "/permission-sets": "Roles & Permissions",
  "/settings": "Pipelines & Fields",
};

/** Set by each page to render its own toolbar row under the top bar. */
export const ToolbarSlot = React.createContext<{
  setToolbar: (node: React.ReactNode) => void;
}>({ setToolbar: () => {} });

export function useToolbar(node: React.ReactNode, deps: React.DependencyList = []) {
  const { setToolbar } = React.useContext(ToolbarSlot);
  React.useEffect(() => {
    setToolbar(node);
    return () => setToolbar(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function Layout({ liveConnected = true }: { liveConnected?: boolean }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [toolbar, setToolbar] = React.useState<React.ReactNode>(null);
  const [navOpen, setNavOpen] = React.useState(false);

  const title =
    PAGE_TITLES[location.pathname] ??
    (location.pathname.startsWith("/contacts/") ? "Contact" : "Relay");

  const initials = (user?.name ?? "")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

  return (
    <div className="flex min-h-screen bg-surface">
      <div className="flex w-full overflow-hidden bg-surface">
        {/* ---------------------------------------------------------- sidebar */}
        <aside
          className={cn(
            "absolute inset-y-0 left-0 z-30 w-64 shrink-0 flex-col justify-between border-r border-border bg-surface p-3 md:static md:flex",
            navOpen ? "flex" : "hidden"
          )}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between px-1 pt-1">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-white">
                  <Sun className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="leading-tight">
                  <p className="text-base font-semibold text-text">Relay</p>
                  <p className="text-xs text-text-muted">CRM &amp; Lead Engine</p>
                </div>
              </div>
              <button
                onClick={() => setNavOpen(false)}
                className="rounded-sm p-1 text-text-muted hover:bg-muted md:hidden"
                aria-label="Close navigation"
              >
                <PanelLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* workspace switcher */}
            <button className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <span className="flex items-center gap-2 truncate">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-warning/15 text-xs font-semibold text-warning">
                  {user?.workspace.name?.[0] ?? "W"}
                </span>
                <span className="truncate text-base font-medium text-text">
                  {user?.workspace.name}
                </span>
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
            </button>

            <nav className="flex flex-col gap-0.5">
              {NAV_PRIMARY.map((item) => (
                <SideLink key={item.to} {...item} onNavigate={() => setNavOpen(false)} />
              ))}
            </nav>

            <div className="border-t border-border pt-3">
              <p className="px-2.5 pb-1 text-xs font-medium uppercase tracking-wide text-text-muted">
                Workspace
              </p>
              <nav className="flex flex-col gap-0.5">
                {NAV_SECONDARY.map((item) => (
                  <SideLink key={item.to} {...item} onNavigate={() => setNavOpen(false)} />
                ))}
              </nav>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 px-2.5 py-2 text-base text-text-muted">
              <LifeBuoy className="h-4 w-4" aria-hidden="true" />
              Help Center
              <ChevronRight className="ml-auto h-4 w-4" aria-hidden="true" />
            </div>

            <div className="flex items-center gap-2 rounded-md border border-border p-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {initials}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-base font-medium text-text">{user?.name}</p>
                <p className="truncate text-xs text-text-muted">{user?.email}</p>
              </div>
              <button
                onClick={() => logout()}
                className="rounded-sm px-2 py-1 text-xs text-text-muted hover:bg-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Exit
              </button>
            </div>
          </div>
        </aside>

        {/* ------------------------------------------------------------ main */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:px-6">
            <button
              onClick={() => setNavOpen(true)}
              className="rounded-sm p-1.5 text-text-muted hover:bg-muted md:hidden"
              aria-label="Open navigation"
            >
              <PanelLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <h1 className="text-lg font-semibold text-text">{title}</h1>
            {/* A dropped live connection means the screen can silently go
                stale, so say so rather than letting it look current. */}
            {!liveConnected && (
              <span
                className="flex items-center gap-1.5 rounded-sm bg-warning/10 px-2 py-1 text-xs font-medium text-warning"
                title="Live updates are disconnected; data may be out of date until it reconnects."
              >
                <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
                Reconnecting
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                className="hidden h-10 w-10 items-center justify-center rounded-md border border-border text-text-muted hover:bg-muted sm:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" aria-hidden="true" />
              </button>
              <div className="relative hidden lg:block">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                  aria-hidden="true"
                />
                <input
                  placeholder="Search something"
                  aria-label="Search"
                  className="h-10 w-56 rounded-md border border-border bg-surface pl-9 pr-3 text-base text-text placeholder:text-text-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>
              <button className="hidden items-center gap-2 rounded-md border border-border px-3 py-2 text-base text-text hover:bg-muted sm:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <Share2 className="h-4 w-4" aria-hidden="true" />
                Share
              </button>
            </div>
          </header>

          {toolbar && (
            <div className="border-b border-border px-4 py-3 md:px-6">{toolbar}</div>
          )}

          <main className="flex-1 overflow-y-auto bg-page/60 p-4 md:p-6">
            <ToolbarSlot.Provider value={{ setToolbar }}>
              <Outlet />
            </ToolbarSlot.Provider>
          </main>
        </div>
      </div>
    </div>
  );
}

function SideLink({
  to,
  label,
  icon: Icon,
  onNavigate,
}: {
  to: string;
  label: string;
  icon: typeof LayoutGrid;
  onNavigate: () => void;
}) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex min-h-[40px] items-center gap-2.5 rounded-md px-2.5 text-base font-medium transition-colors motion-reduce:transition-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-surface",
          isActive ? "bg-muted text-text" : "text-text-muted hover:bg-muted hover:text-text"
        )
      }
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </NavLink>
  );
}
