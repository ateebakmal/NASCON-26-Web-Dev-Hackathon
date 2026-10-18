import { Card, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { useToolbar } from "../../app/layout";
import { AddLeadDialog } from "./add-lead-dialog";
import { LeadInboxTable } from "./lead-inbox-table";
import { useLeads } from "./api";

export function LeadsPage() {
  const { data, isLoading, isError } = useLeads();

  useToolbar(
    <div className="flex items-center gap-2">
      <p className="text-sm text-text-muted">
        Every lead has exactly one accountable owner at all times.
      </p>
      <div className="ml-auto">
        <AddLeadDialog />
      </div>
    </div>,
    []
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border">
        <CardTitle>Inbox</CardTitle>
        <CardDescription>Sorted newest first. New leads appear live.</CardDescription>
      </CardHeader>
      {isError ? (
        <p role="alert" className="p-5 text-base text-danger">
          Could not load leads. Retrying…
        </p>
      ) : (
        <LeadInboxTable leads={data?.items} isLoading={isLoading} />
      )}
    </Card>
  );
}
