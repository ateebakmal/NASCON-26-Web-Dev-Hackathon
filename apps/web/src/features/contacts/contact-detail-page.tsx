import * as React from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { cn } from "../../lib/utils";
import { useContact } from "./api";

const TABS = ["Timeline", "Deals", "Payments", "Appointments"] as const;
type Tab = (typeof TABS)[number];

/** The complete customer view (F2.8) with its activity timeline (F2.7). */
export function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useContact(id);
  const [tab, setTab] = React.useState<Tab>("Timeline");

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Loading contact…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <p role="alert" className="py-8 text-base text-danger">
        Could not load this contact.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/contacts"
        className="flex w-fit items-center gap-1.5 text-sm text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All contacts
      </Link>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text">{data.name}</h2>
            <p className="text-base text-text-muted">
              {data.company?.name ?? "No company"} · {data.phone ?? "—"} · {data.email ?? "—"}
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {data.optedOut && <Badge variant="danger">Opted out</Badge>}
            {data.tags.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="h-fit p-5">
          <p className="text-md font-semibold text-text">Details</p>
          <dl className="mt-3 flex flex-col gap-3 text-base">
            <Field label="Phone" value={data.phone} />
            <Field label="Email" value={data.email} />
            <Field label="Company" value={data.company?.name ?? null} />
            {Object.entries(data.customFields ?? {}).map(([k, v]) => (
              <Field key={k} label={k.replace(/_/g, " ")} value={String(v)} />
            ))}
          </dl>
        </Card>

        <Card>
          <div className="flex gap-1 border-b border-border px-3 pt-3">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                aria-pressed={tab === t}
                className={cn(
                  "rounded-t-md px-3 py-2 text-base font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  tab === t
                    ? "border-b-2 border-primary text-text"
                    : "text-text-muted hover:text-text"
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="p-5">
            {tab === "Timeline" && <Timeline items={data.timeline} />}

            {tab === "Deals" && (
              <ul className="flex flex-col gap-2">
                {data.opportunities.length === 0 && <Empty>No deals yet.</Empty>}
                {data.opportunities.map((o) => (
                  <li
                    key={o.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
                  >
                    <div>
                      <p className="text-base font-medium text-text">{o.name}</p>
                      <p className="text-sm text-text-muted">
                        {o.pipeline.name} · {o.owner?.name ?? "Unassigned"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          o.stage.type === "WON"
                            ? "success"
                            : o.stage.type === "LOST"
                              ? "danger"
                              : "primary"
                        }
                      >
                        {o.stage.name}
                      </Badge>
                      <span className="text-base font-medium text-text">
                        {o.value === null ? (
                          <span className="flex items-center gap-1 text-text-muted">
                            <Lock className="h-3 w-3" aria-hidden="true" /> Hidden
                          </span>
                        ) : (
                          `${o.currency} ${Number(o.value).toLocaleString()}`
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {tab === "Payments" && (
              <>
                <ul className="flex flex-col gap-2">
                  {data.payments.length === 0 && <Empty>No payments yet.</Empty>}
                  {data.payments.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
                    >
                      <div>
                        <p className="text-base font-medium text-text">
                          {p.currency} {Number(p.amount).toLocaleString()}
                        </p>
                        <p className="text-sm text-text-muted">{p.providerRef ?? "—"}</p>
                      </div>
                      <Badge
                        variant={
                          p.status === "PAID"
                            ? "success"
                            : p.status === "REFUNDED" || p.status === "FAILED"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {p.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
                <Note>
                  Stripe is not connected yet, so these are seeded records rather than live
                  payment events.
                </Note>
              </>
            )}

            {tab === "Appointments" && (
              <>
                <ul className="flex flex-col gap-2">
                  {data.appointments.length === 0 && <Empty>No appointments booked.</Empty>}
                  {data.appointments.map((a) => (
                    <li key={a.id} className="rounded-md border border-border p-3">
                      <p className="text-base font-medium text-text">{a.title}</p>
                      <p className="text-sm text-text-muted">
                        {new Date(a.startsAt).toLocaleString()} —{" "}
                        {new Date(a.endsAt).toLocaleTimeString(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </li>
                  ))}
                </ul>
                <Note>
                  Google Calendar is not connected yet, so these exist in Relay only and are not
                  mirrored to a real calendar.
                </Note>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-sm capitalize text-text-muted">{label}</dt>
      <dd className="text-base text-text">{value || "—"}</dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <li className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-text-muted">
      {children}
    </li>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-xs text-text-muted">{children}</p>;
}

const EVENT_LABEL: Record<string, string> = {
  "lead.assigned": "Lead assigned",
  "lead.acknowledged": "Lead acknowledged",
  "lead.escalated": "Lead escalated",
  "lead.reassigned_status_change": "Reassigned (owner away)",
  "deal.created": "Deal created",
  "deal.stage_changed": "Stage changed",
  "contact.created": "Contact created",
};

function Timeline({ items }: { items: Array<{ id: string; eventType: string; actorLabel: string; before: unknown; after: unknown; createdAt: string }> }) {
  if (items.length === 0) {
    return <p className="text-base text-text-muted">Nothing has happened on this contact yet.</p>;
  }
  return (
    <ol className="flex flex-col gap-0">
      {items.map((item, i) => (
        <li key={item.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
            {i < items.length - 1 && <span className="w-px flex-1 bg-border" />}
          </div>
          <div className="pb-5">
            <p className="text-base text-text">
              {EVENT_LABEL[item.eventType] ?? item.eventType}
              {describeChange(item.before, item.after) && (
                <span className="text-text-muted"> · {describeChange(item.before, item.after)}</span>
              )}
            </p>
            <p className="text-sm text-text-muted">
              {item.actorLabel} · {new Date(item.createdAt).toLocaleString()}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function describeChange(before: unknown, after: unknown): string | null {
  const b = before as Record<string, unknown> | null;
  const a = after as Record<string, unknown> | null;
  if (a?.stage && b?.stage) return `${b.stage} → ${a.stage}`;
  if (a?.stage) return String(a.stage);
  if (a?.name) return String(a.name);
  return null;
}
