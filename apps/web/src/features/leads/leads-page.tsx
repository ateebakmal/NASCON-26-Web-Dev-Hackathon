import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { ManualLeadEntryForm } from "./manual-lead-entry-form";
import { LeadInboxTable } from "./lead-inbox-table";
import { useLeads } from "./api";

export function LeadsPage() {
  const { data, isLoading, isError } = useLeads();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text">Leads</h1>
        <p className="text-sm text-text/60">Every lead has exactly one accountable owner at all times.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a lead</CardTitle>
          <CardDescription>Manual entry stands in for the WhatsApp/web-form intake built in a later phase.</CardDescription>
        </CardHeader>
        <CardContent>
          <ManualLeadEntryForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inbox</CardTitle>
        </CardHeader>
        <CardContent>
          {isError ? (
            <p role="alert" className="py-4 text-sm text-danger">
              Could not load leads. Retrying…
            </p>
          ) : (
            <LeadInboxTable leads={data?.items} isLoading={isLoading} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
