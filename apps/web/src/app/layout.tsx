import { NavLink, Outlet } from "react-router-dom";
import { Inbox, ListChecks, Shield, Users2, LogOut } from "lucide-react";
import { useAuth } from "./auth-context";
import { cn } from "../lib/utils";

const NAV_ITEMS = [
  { to: "/leads", label: "Leads", icon: Inbox },
  { to: "/recovery-queue", label: "Recovery Queue", icon: ListChecks },
  { to: "/employees", label: "Employees", icon: Users2 },
  { to: "/permission-sets", label: "Permission Sets", icon: Shield },
];

// Sidebar on tablet/laptop, a wrapping top bar on phone -- no fixed-width
// column that would force horizontal scroll at narrow viewports (Q7).
export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex flex-col justify-between border-b border-white/10 bg-surface/80 p-4 md:w-64 md:border-b-0 md:border-r">
        <div>
          <div className="mb-4 px-2 md:mb-6">
            <p className="text-sm font-semibold text-text">{user?.workspace.name}</p>
            <p className="text-xs text-text/50">
              {user?.name} · {user?.baseRole}
            </p>
          </div>
          <nav className="flex flex-wrap gap-1 md:flex-col">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-[44px] items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors motion-reduce:transition-none",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                    isActive ? "bg-primary/20 text-primary" : "text-text/70 hover:bg-white/5 hover:text-text"
                  )
                }
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <button
          onClick={() => logout()}
          className="mt-2 flex min-h-[44px] items-center gap-2 rounded-md px-3 text-sm text-text/60 transition-colors hover:bg-white/5 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Log out
        </button>
      </aside>
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
