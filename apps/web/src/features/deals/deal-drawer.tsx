import * as React from "react";
import { Loader2, Lock, Send, XCircle } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { CopyButton } from "../../components/ui/copy-button";
import { Input } from "../../components/ui/input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import { ApiError } from "../../lib/api";
import { useCreatePaymentLink, useExpirePayment, usePayments, type Payment } from "./api";
import type { Deal } from "./types";

const STATUS_VARIANT: Record<Payment["status"], "neutral" | "success" | "warning" | "danger"> = {
  PENDING: "warning",
  PAID: "success",
  EXPIRED: "neutral",
  FAILED: "danger",
  REFUNDED: "danger",
};

export function DealDrawer({ deal, onClose }: { deal: Deal | null; onClose: () => void }) {
  return (
    <Sheet open={Boolean(deal)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{deal?.name}</SheetTitle>
          <SheetDescription>
            {deal?.contact.company?.name ?? deal?.contact.name} ·{" "}
            {deal?.value === null ? "value hidden" : `${deal?.currency} ${Number(deal?.value ?? 0).toLocaleString()}`}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>{deal && <DealBody deal={deal} />}</SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function DealBody({ deal }: { deal: Deal }) {
  const { data: payments, isLoading } = usePayments(deal.id);
  const createLink = useCreatePaymentLink(deal.id);
  const expirePayment = useExpirePayment();

  // Masked deals come back with value null, so don't prefill a fake number.
  const [amount, setAmount] = React.useState(deal.value === null ? "" : String(deal.value));
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const request = async (send: boolean) => {
    setError(null);
    setNotice(null);
    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value <= 0) {
      return setError("Enter an amount greater than zero.");
    }
    try {
      const res = await createLink.mutateAsync({ amount: value, currency: deal.currency, send });
      if (send) {
        setNotice(
          res.accepted
            ? "Link created and sent on WhatsApp."
            : `Link created, but it could not be sent: ${res.reason ?? "unknown reason"}. Copy it below instead.`
        );
      } else {
        setNotice("Link created. Copy it below.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the payment link");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className="text-sm font-medium uppercase tracking-wide text-text-muted">Deal</h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-base">
          <Field label="Contact" value={deal.contact.name} />
          <Field label="Company" value={deal.contact.company?.name ?? null} />
          <Field label="Owner" value={deal.owner?.name ?? null} />
          <Field label="Tag" value={deal.tag} />
        </dl>
      </section>

      <section>
        <h3 className="text-sm font-medium uppercase tracking-wide text-text-muted">
          Request payment
        </h3>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-1 min-w-[140px] flex-col gap-1 text-sm text-text-muted">
            Amount ({deal.currency})
            <Input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="85000"
            />
          </label>
          <Button
            onClick={() => request(true)}
            loading={createLink.isPending}
            className="gap-1.5"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            Send on WhatsApp
          </Button>
          <Button variant="secondary" onClick={() => request(false)} loading={createLink.isPending}>
            Create link only
          </Button>
        </div>

        {notice && <p className="mt-2 text-sm text-text-muted">{notice}</p>}
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </section>

      <section>
        <h3 className="text-sm font-medium uppercase tracking-wide text-text-muted">Payments</h3>

        {isLoading ? (
          <div className="mt-3 flex items-center gap-2 text-text-muted">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Loading…
          </div>
        ) : !payments?.length ? (
          <p className="mt-3 rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-text-muted">
            No payment requested yet.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {payments.map((p) => (
              <li key={p.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-base font-medium text-text">
                      {p.currency} {Number(p.amount).toLocaleString()}
                      {Number(p.refundedAmount) > 0 && (
                        <span className="ml-2 text-sm font-normal text-danger">
                          −{Number(p.refundedAmount).toLocaleString()} refunded
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-text-muted">
                      {p.paidAt
                        ? `Paid ${new Date(p.paidAt).toLocaleString()}`
                        : p.expiresAt
                          ? `Expires ${new Date(p.expiresAt).toLocaleTimeString()}`
                          : new Date(p.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[p.status]}>{p.status}</Badge>
                </div>

                {p.checkoutUrl && p.status === "PENDING" && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <CopyButton value={p.checkoutUrl} />
                    <a
                      href={p.checkoutUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      Open checkout
                    </a>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto gap-1.5"
                      loading={expirePayment.isPending}
                      onClick={() => expirePayment.mutate(p.id)}
                    >
                      <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      Cancel link
                    </Button>
                  </div>
                )}

                {p.providerRef && (
                  <p className="mt-2 truncate text-xs text-text-muted" title={p.providerRef}>
                    {p.providerRef}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-xs text-text-muted">
          Status is set by Stripe's webhook, not by this screen — so it stays correct even if the
          customer pays on another device.
        </p>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="text-base text-text">
        {value ?? <span className="inline-flex items-center gap-1 text-text-muted"><Lock className="h-3 w-3" aria-hidden="true" />—</span>}
      </dd>
    </div>
  );
}
