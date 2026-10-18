import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Card } from "../../components/ui/card";
import { useContact } from "./api";
import { ContactDetailView } from "./contact-detail-view";

/** Standalone, linkable version of the same view the drawer renders. */
export function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useContact(id);

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/contacts"
        className="flex w-fit items-center gap-1.5 text-sm text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All contacts
      </Link>

      {data && (
        <Card className="p-5">
          <h2 className="text-lg font-semibold text-text">{data.name}</h2>
          <p className="text-base text-text-muted">
            {data.company?.name ?? "No company"} · {data.phone ?? "—"} · {data.email ?? "—"}
          </p>
        </Card>
      )}

      <Card className="p-5">
        <ContactDetailView contactId={id} />
      </Card>
    </div>
  );
}
