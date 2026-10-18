import * as React from "react";
import { useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  Lock,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  Info,
  Loader2,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { cn } from "../../lib/utils";
import { useToolbar } from "../../app/layout";
import { useDashboard, type DashboardOverview } from "./api";

const PKR = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 });

function formatMoney(n: number | null | undefined) {
  // null means the value was masked for this role, not that it is zero.
  if (n === null || n === undefined) return "——";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return PKR.format(n);
}

function formatDuration(seconds: number) {
  if (seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${(m / 60).toFixed(1)}h`;
}

export function DashboardPage() {
  const { data, isLoading, isError } = useDashboard();
  const navigate = useNavigate();
  const [hidden, setHidden] = React.useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("dashboard:hidden") ?? "[]");
    } catch {
      return [];
    }
  });
  const [customising, setCustomising] = React.useState(false);

  const toggle = (key: string) => {
    setHidden((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try {
        localStorage.setItem("dashboard:hidden", JSON.stringify(next));
      } catch {
        /* storage unavailable; the choice just won't persist */
      }
      return next;
    });
  };

  useToolbar(
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        className="gap-1.5"
        onClick={() => setCustomising((v) => !v)}
        aria-pressed={customising}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        Customize Widget
      </Button>
      <div className="ml-auto flex items-center gap-2">
        <span className="hidden items-center gap-1.5 text-sm text-success sm:flex">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Last updated now
        </span>
        <Button variant="secondary" size="sm" className="gap-1.5">
          <Upload className="h-4 w-4" aria-hidden="true" />
          Imports
        </Button>
        <Button variant="dark" size="sm" className="gap-1.5">
          <Download className="h-4 w-4" aria-hidden="true" />
          Exports
        </Button>
      </div>
    </div>,
    [customising]
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Loading dashboard…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <p role="alert" className="py-8 text-base text-danger">
        Could not load the dashboard.
      </p>
    );
  }

  const visible = (key: string) => !hidden.includes(key);

  return (
    <div className="flex flex-col gap-4">
      {customising && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-medium text-text">Show or hide widgets</p>
          <div className="flex flex-wrap gap-3">
            {WIDGETS.map((w) => (
              <label key={w.key} className="flex items-center gap-2 text-sm text-text-muted">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={visible(w.key)}
                  onChange={() => toggle(w.key)}
                />
                {w.label}
              </label>
            ))}
          </div>
        </Card>
      )}

      {/* ------------------------------------------------- KPI row + calendar */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          {visible("kpis") && (
            <div className="grid gap-4 sm:grid-cols-3">
              <KpiCard
                label="Leads"
                value={String(data.newLeadsToday)}
                caption="new today"
                delta={`${data.openLeads} open`}
                trend="up"
                onClick={() => navigate("/leads")}
              />
              <KpiCard
                label="Conversion Rate"
                value={`${data.conversionRate}%`}
                caption="won of closed deals"
                delta={`${data.leadsManagement.won} won`}
                trend="up"
                onClick={() => navigate("/deals")}
              />
              <KpiCard
                label="Avg response"
                value={formatDuration(data.avgResponseSeconds)}
                caption="time to first response"
                delta={`${data.recoveryCount} at risk`}
                trend={data.recoveryCount > 0 ? "down" : "up"}
                onClick={() => navigate("/recovery-queue")}
                info
              />
            </div>
          )}

          {visible("revenue") && (
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-text-muted">Collected revenue</p>
                  <p className="mt-1 flex items-center gap-2 text-2xl font-semibold text-text">
                    {data.collectedThisMonth === null ? (
                      <span className="flex items-center gap-1.5 text-md font-medium text-text-muted">
                        <Lock className="h-4 w-4" aria-hidden="true" />
                        Hidden for your role
                      </span>
                    ) : (
                      `PKR ${formatMoney(data.collectedThisMonth)}`
                    )}
                  </p>
                  <p className="text-sm text-text-muted">
                    this month · open pipeline PKR {formatMoney(data.openPipelineValue)}
                  </p>
                </div>
                <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
                  {["1M", "6M", "1Y"].map((r, i) => (
                    <span
                      key={r}
                      className={cn(
                        "rounded px-2.5 py-1 text-sm font-medium",
                        i === 2 ? "bg-muted text-text" : "text-text-muted"
                      )}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-4 h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.revenueSeries}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgb(37 99 235)" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="rgb(37 99 235)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(232 234 239)" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tickFormatter={(m: string) =>
                        new Date(`${m}-01`).toLocaleDateString(undefined, { month: "short" })
                      }
                      tick={{ fontSize: 12, fill: "rgb(109 117 133)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v: number) => formatMoney(v)}
                      tick={{ fontSize: 12, fill: "rgb(109 117 133)" }}
                      axisLine={false}
                      tickLine={false}
                      width={48}
                    />
                    <Tooltip
                      formatter={(v) => [`PKR ${PKR.format(Number(v ?? 0))}`, "Collected"]}
                      labelFormatter={(m) =>
                        new Date(`${String(m)}-01`).toLocaleDateString(undefined, {
                          month: "long",
                          year: "numeric",
                        })
                      }
                      contentStyle={{
                        borderRadius: 10,
                        border: "1px solid rgb(232 234 239)",
                        fontSize: 13,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="rgb(37 99 235)"
                      strokeWidth={2}
                      fill="url(#rev)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </div>

        {visible("calendar") && <UpcomingPanel data={data} />}
      </div>

      {/* ------------------------------------------------------ bottom row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {visible("leadsManagement") && (
          <Card className="p-5">
            <p className="text-md font-semibold text-text">Deal Management</p>
            <div className="mt-3 flex gap-1">
              {data.byStage.map((s) => (
                <span
                  key={s.stageId}
                  className={cn("h-1.5 flex-1 rounded-full", stageBar(s.type))}
                  title={`${s.name}: ${s.count}`}
                />
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <MiniStat label="Open" value={data.leadsManagement.open} tone="slate" />
              <MiniStat label="In progress" value={data.leadsManagement.inProgress} tone="blue" />
              <MiniStat label="Lost" value={data.leadsManagement.lost} tone="rose" />
              <MiniStat label="Won" value={data.leadsManagement.won} tone="emerald" />
            </div>
          </Card>
        )}

        {visible("escalations") && (
          <Card className="p-5">
            <p className="text-md font-semibold text-text">Escalations</p>
            <p className="mt-1 text-xl font-semibold text-text">
              {data.escalations24h}
              <span className="ml-2 text-sm font-normal text-text-muted">in the last 24h</span>
            </p>
            <div className="mt-3 h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.escalationSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(232 234 239)" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(d: string) =>
                      new Date(d).toLocaleDateString(undefined, { weekday: "short" })
                    }
                    tick={{ fontSize: 12, fill: "rgb(109 117 133)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: "rgb(109 117 133)" }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid rgb(232 234 239)",
                      fontSize: 13,
                    }}
                  />
                  <Bar dataKey="count" fill="rgb(37 99 235)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {visible("availability") && (
          <Card className="p-5">
            <p className="text-md font-semibold text-text">Team availability</p>
            <ul className="mt-3 flex flex-col gap-2">
              {data.availability.map((a) => (
                <li key={a.availability} className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2 text-text">
                    <span className={cn("h-2 w-2 rounded-full", availabilityDot(a.availability))} />
                    {a.availability.replace("_", " ").toLowerCase()}
                  </span>
                  <span className="font-medium text-text-muted">{a.count}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-sm text-text-muted">
                Only <span className="font-medium text-text">Available</span> employees under their
                lead limit receive round-robin assignments.
              </p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

const WIDGETS = [
  { key: "kpis", label: "KPI cards" },
  { key: "revenue", label: "Revenue chart" },
  { key: "calendar", label: "Upcoming" },
  { key: "leadsManagement", label: "Deal management" },
  { key: "escalations", label: "Escalations" },
  { key: "availability", label: "Team availability" },
];

function stageBar(type: string) {
  if (type === "WON") return "bg-success";
  if (type === "LOST") return "bg-danger/60";
  return "bg-primary/50";
}

function availabilityDot(a: string) {
  if (a === "AVAILABLE") return "bg-success";
  if (a === "BUSY") return "bg-warning";
  if (a === "ON_LEAVE") return "bg-text-muted";
  return "bg-danger";
}

function KpiCard({
  label,
  value,
  caption,
  delta,
  trend,
  onClick,
  info,
}: {
  label: string;
  value: string;
  caption: string;
  delta: string;
  trend: "up" | "down";
  onClick: () => void;
  info?: boolean;
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="cursor-pointer p-4 transition-shadow hover:shadow-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="flex items-center gap-1.5">
        <p className="text-base font-medium text-text">{label}</p>
        {info && <Info className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />}
        <span
          className={cn(
            "ml-auto flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium",
            trend === "up" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
          )}
        >
          {trend === "up" ? (
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
          )}
          {delta}
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-text">{value}</p>
      <p className="text-sm text-text-muted">{caption}</p>
    </Card>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "slate" | "blue" | "rose" | "emerald";
}) {
  const bar = {
    slate: "bg-text-muted/40",
    blue: "bg-primary",
    rose: "bg-danger/70",
    emerald: "bg-success",
  }[tone];
  return (
    <div className="rounded-md border border-border p-3">
      <span className={cn("block h-1 w-6 rounded-full", bar)} />
      <p className="mt-2 text-sm text-text-muted">{label}</p>
      <p className="text-md font-semibold text-text">
        {value} <span className="text-sm font-normal text-text-muted">deals</span>
      </p>
    </div>
  );
}

function UpcomingPanel({ data }: { data: DashboardOverview }) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center justify-between">
        <p className="text-md font-semibold text-text">Upcoming</p>
        <span className="flex items-center gap-1.5 text-sm text-text-muted">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          {new Date().toLocaleDateString(undefined, { month: "long" })}
        </span>
      </div>

      <ul className="mt-4 flex flex-col gap-3">
        {data.upcomingAppointments.length === 0 && (
          <li className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-text-muted">
            No upcoming appointments
          </li>
        )}
        {data.upcomingAppointments.map((appt) => (
          <li key={appt.id} className="flex gap-3">
            <span className="w-14 shrink-0 pt-0.5 text-sm text-text-muted">
              {new Date(appt.startsAt).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
            <div className="flex-1 rounded-md border border-border bg-muted/50 p-3">
              <p className="text-base font-medium text-text">{appt.title}</p>
              <p className="mt-0.5 text-sm text-text-muted">
                {appt.contact?.name ?? "No contact"} ·{" "}
                {new Date(appt.startsAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-auto flex items-start gap-2 border-t border-border pt-3 text-xs text-text-muted">
        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Appointments are stored in Relay. Google Calendar sync is not connected yet, so these are
        not yet mirrored to a real calendar.
      </p>
    </Card>
  );
}
