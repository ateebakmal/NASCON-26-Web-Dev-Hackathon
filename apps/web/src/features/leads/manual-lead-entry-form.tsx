import * as React from "react";
import { createLeadSchema } from "@ubp/shared";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useCreateLead } from "./api";
import { ApiError } from "../../lib/api";

// Stand-in intake source for the MVP-core slice (Twilio/web-form intake land
// in the integrations phase) -- exercises the exact same assignment +
// escalation path a real inbound lead would.
export function ManualLeadEntryForm() {
  const createLead = useCreateLead();
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = createLeadSchema.safeParse({
      name,
      phone: phone || undefined,
      email: email || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    try {
      await createLead.mutateAsync(parsed.data);
      setName("");
      setPhone("");
      setEmail("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create lead");
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap" noValidate>
      <label className="flex flex-1 min-w-[160px] flex-col gap-1 text-sm text-text-muted">
        Name
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Prospect" />
      </label>
      <label className="flex flex-1 min-w-[160px] flex-col gap-1 text-sm text-text-muted">
        Phone
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" />
      </label>
      <label className="flex flex-1 min-w-[160px] flex-col gap-1 text-sm text-text-muted">
        Email
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
      </label>
      <Button type="submit" loading={createLead.isPending}>
        Add lead
      </Button>
      {error && (
        <p role="alert" className="w-full text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
