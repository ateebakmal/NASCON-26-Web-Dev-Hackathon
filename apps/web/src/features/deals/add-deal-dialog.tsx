import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input, Select } from "../../components/ui/input";
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
import { useContacts } from "../contacts/api";
import { useCreateDeal } from "./api";
import type { Stage } from "./types";

export function AddDealDialog({
  pipelineId,
  stages,
}: {
  pipelineId: string | undefined;
  stages: Stage[];
}) {
  const createDeal = useCreateDeal();
  // Only fetch the contact list once the dialog is actually opened.
  const [open, setOpen] = React.useState(false);
  const { data: contacts, isLoading: contactsLoading } = useContacts("");

  const [name, setName] = React.useState("");
  const [value, setValue] = React.useState("");
  const [contactId, setContactId] = React.useState("");
  const [stageId, setStageId] = React.useState("");
  const [tag, setTag] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  // Default to the first stage of the board being viewed.
  React.useEffect(() => {
    if (!stageId && stages.length) setStageId(stages[0].id);
  }, [stages, stageId]);

  const reset = () => {
    setName("");
    setValue("");
    setContactId("");
    setTag("");
    setStageId(stages[0]?.id ?? "");
    setError(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError("Give the deal a name.");
    if (!contactId) return setError("Pick the contact this deal belongs to.");
    const numericValue = Number(value);
    if (!value || Number.isNaN(numericValue) || numericValue < 0) {
      return setError("Enter a value of zero or more.");
    }

    try {
      await createDeal.mutateAsync({
        name: name.trim(),
        value: numericValue,
        contactId,
        pipelineId,
        stageId: stageId || undefined,
        tag: tag.trim() || undefined,
      });
      reset();
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the deal");
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
          Add New
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>New deal</DialogTitle>
          <DialogDescription>It appears on the board immediately.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate>
          <div className="flex flex-col gap-3 p-5">
            <label className="flex flex-col gap-1 text-sm text-text-muted">
              Deal name
              <Input
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="10 kW rooftop install"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-text-muted">
              Contact
              <Select
                required
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                disabled={contactsLoading}
              >
                <option value="">
                  {contactsLoading ? "Loading contacts…" : "Select a contact…"}
                </option>
                {contacts?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.company ? ` · ${c.company.name}` : ""}
                  </option>
                ))}
              </Select>
            </label>

            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1 text-sm text-text-muted">
                Value (PKR)
                <Input
                  type="number"
                  min="0"
                  required
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="850000"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-sm text-text-muted">
                Stage
                <Select value={stageId} onChange={(e) => setStageId(e.target.value)}>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </label>
            </div>

            <label className="flex flex-col gap-1 text-sm text-text-muted">
              Tag
              <Input
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="Rooftop"
              />
            </label>

            {/* A stage with required fields can't be filled from here, so say
                so rather than letting the create fail with a 409. */}
            {stages.find((s) => s.id === stageId)?.requiredFieldKeys.length ? (
              <p className="text-xs text-warning">
                This stage normally requires extra fields. The deal is created, then drag it in to
                fill them.
              </p>
            ) : null}

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
            <Button type="submit" loading={createDeal.isPending}>
              Create deal
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
