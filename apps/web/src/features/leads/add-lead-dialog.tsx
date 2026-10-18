import * as React from "react";
import { Plus } from "lucide-react";
import { createLeadSchema } from "@ubp/shared";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import { ApiError } from "../../lib/api";
import { useCreateLead } from "./api";

/**
 * Manual intake. Creating the lead here runs the exact same capture ->
 * route -> assign -> countdown path a WhatsApp or web-form lead will,
 * so the engine is exercised identically whichever source is used.
 */
export function AddLeadDialog() {
  const createLead = useCreateLead();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const reset = () => {
    setName("");
    setPhone("");
    setEmail("");
    setNotes("");
    setError(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = createLeadSchema.safeParse({
      name,
      phone: phone || undefined,
      email: email || undefined,
      notes: notes || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the form");
      return;
    }

    try {
      await createLead.mutateAsync(parsed.data);
      reset();
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the lead");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="dark" size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Lead
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a lead</DialogTitle>
          <DialogDescription>
            It will be routed and assigned immediately, with the acknowledgement countdown started.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate>
          <div className="flex flex-col gap-3 p-5">
            <label className="flex flex-col gap-1 text-sm text-text-muted">
              Name
              <Input
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ayesha Siddiqui"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-text-muted">
              Phone
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+92 300 1234567"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-text-muted">
              Email
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ayesha@example.com"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-text-muted">
              Notes
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Asked about a 5 kW system"
              />
            </label>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createLead.isPending}>
              Create lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
