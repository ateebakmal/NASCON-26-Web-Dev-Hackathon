import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input, Select } from "../../components/ui/input";
import type { RequiredFieldsError } from "./types";

/**
 * When a board move is blocked, this asks for ONLY the missing fields and
 * completes the move on save (A2.3) -- the user never has to open the deal,
 * hunt for the field and drag again.
 */
export function RequiredFieldsDialog({
  request,
  submitting,
  onCancel,
  onSubmit,
}: {
  request: RequiredFieldsError;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  const [values, setValues] = React.useState<Record<string, unknown>>({});
  const [touchedError, setTouchedError] = React.useState<string | null>(null);

  const set = (key: string, value: unknown) => setValues((v) => ({ ...v, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const missing = request.fields.filter((f) => {
      const v = values[f.key];
      return v === undefined || v === null || v === "";
    });
    if (missing.length) {
      setTouchedError(`Still missing: ${missing.map((m) => m.label).join(", ")}`);
      return;
    }
    setTouchedError(null);
    onSubmit(values);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-text/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="required-fields-title"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-pop"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-warning/10">
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
          </span>
          <div>
            <h2 id="required-fields-title" className="text-md font-semibold text-text">
              {request.stageName} needs more detail
            </h2>
            <p className="mt-0.5 text-sm text-text-muted">
              Fill these in to move the deal. Nothing else is required.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {request.fields.map((field) => (
            <label key={field.key} className="flex flex-col gap-1 text-sm text-text-muted">
              {field.label}
              {field.type === "DROPDOWN" ? (
                <Select
                  value={(values[field.key] as string) ?? ""}
                  onChange={(e) => set(field.key, e.target.value)}
                >
                  <option value="">Select…</option>
                  {field.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              ) : field.type === "CHECKBOX" ? (
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-primary"
                  checked={Boolean(values[field.key])}
                  onChange={(e) => set(field.key, e.target.checked)}
                />
              ) : (
                <Input
                  type={field.type === "NUMBER" ? "number" : field.type === "DATE" ? "date" : "text"}
                  value={(values[field.key] as string) ?? ""}
                  onChange={(e) =>
                    set(field.key, field.type === "NUMBER" ? Number(e.target.value) : e.target.value)
                  }
                />
              )}
            </label>
          ))}
        </div>

        {touchedError && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {touchedError}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Save &amp; move
          </Button>
        </div>
      </form>
    </div>
  );
}
