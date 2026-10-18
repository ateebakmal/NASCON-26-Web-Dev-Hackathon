import * as React from "react";
import { Archive, Loader2, Plus } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input, Select } from "../../components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { ApiError } from "../../lib/api";
import {
  useArchiveField,
  useCreateField,
  useCustomFields,
  usePipelineSettings,
  type FieldType,
  type RecordType,
} from "./api";

const FIELD_TYPES: Array<{ value: FieldType; label: string }> = [
  { value: "TEXT", label: "Text" },
  { value: "NUMBER", label: "Number" },
  { value: "DATE", label: "Date" },
  { value: "DROPDOWN", label: "Dropdown" },
  { value: "CHECKBOX", label: "Checkbox" },
];

/**
 * Custom fields created from the interface (F2.2). Deal fields can be scoped
 * to one pipeline, which is what lets two pipelines show different field sets
 * while sharing the same contact information (F2.3).
 */
export function FieldSettings() {
  const { data: fields, isLoading } = useCustomFields();
  const { data: pipelines } = usePipelineSettings();
  const createField = useCreateField();
  const archiveField = useArchiveField();

  const [recordType, setRecordType] = React.useState<RecordType>("DEAL");
  const [label, setLabel] = React.useState("");
  const [type, setType] = React.useState<FieldType>("TEXT");
  const [pipelineId, setPipelineId] = React.useState("");
  const [options, setOptions] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!label.trim()) return setError("Give the field a name.");
    if (type === "DROPDOWN" && !options.trim()) {
      return setError("A dropdown needs at least one option.");
    }

    try {
      await createField.mutateAsync({
        recordType,
        label: label.trim(),
        type,
        // Only deal fields can be pipeline-specific; contact and company
        // fields are shared across the workspace.
        pipelineId: recordType === "DEAL" && pipelineId ? pipelineId : null,
        options:
          type === "DROPDOWN"
            ? options.split(",").map((o) => o.trim()).filter(Boolean)
            : undefined,
      });
      setLabel("");
      setOptions("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the field");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h3 className="text-md font-semibold text-text">New field</h3>
        <p className="mt-0.5 text-sm text-text-muted">
          It appears on forms and detail pages immediately — no developer needed.
        </p>

        <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3" noValidate>
          <label className="flex flex-col gap-1 text-sm text-text-muted">
            Applies to
            <Select
              value={recordType}
              onChange={(e) => setRecordType(e.target.value as RecordType)}
            >
              <option value="DEAL">Deal</option>
              <option value="CONTACT">Contact</option>
              <option value="COMPANY">Company</option>
            </Select>
          </label>

          <label className="flex flex-1 min-w-[160px] flex-col gap-1 text-sm text-text-muted">
            Name
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Roof type" />
          </label>

          <label className="flex flex-col gap-1 text-sm text-text-muted">
            Type
            <Select value={type} onChange={(e) => setType(e.target.value as FieldType)}>
              {FIELD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </label>

          {recordType === "DEAL" && (
            <label className="flex flex-col gap-1 text-sm text-text-muted">
              Pipeline
              <Select value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
                <option value="">All pipelines</option>
                {pipelines?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </label>
          )}

          {type === "DROPDOWN" && (
            <label className="flex flex-1 min-w-[200px] flex-col gap-1 text-sm text-text-muted">
              Options (comma separated)
              <Input
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                placeholder="Concrete, Metal sheet, Tile"
              />
            </label>
          )}

          <Button type="submit" loading={createField.isPending} className="gap-1.5">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add field
          </Button>

          {error && (
            <p role="alert" className="w-full text-sm text-danger">
              {error}
            </p>
          )}
        </form>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Field</TableHead>
              <TableHead>Applies to</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableEmpty colSpan={5}>
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  Loading fields…
                </span>
              </TableEmpty>
            )}
            {!isLoading && !fields?.length && (
              <TableEmpty colSpan={5}>No custom fields yet.</TableEmpty>
            )}
            {fields?.map((f) => (
              <TableRow key={f.id}>
                <TableCell>
                  <p className="font-medium text-text">{f.label}</p>
                  <p className="text-sm text-text-muted">{f.key}</p>
                </TableCell>
                <TableCell>
                  <Badge>{f.recordType}</Badge>
                </TableCell>
                <TableCell className="text-text-muted">
                  {f.type}
                  {f.type === "DROPDOWN" && f.options.length > 0 && (
                    <span className="block text-sm">{f.options.join(", ")}</span>
                  )}
                </TableCell>
                <TableCell className="text-text-muted">
                  {f.pipeline?.name ?? "All pipelines"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    loading={archiveField.isPending}
                    onClick={() => archiveField.mutate(f.id)}
                    // Archive, not delete: the data stays and the field is
                    // restorable (A2.5).
                    title="Archive — hides the field but keeps existing data"
                  >
                    <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                    Archive
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
