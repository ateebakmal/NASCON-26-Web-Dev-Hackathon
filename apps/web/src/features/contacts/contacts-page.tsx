import * as React from "react";
import { Link } from "react-router-dom";
import { Loader2, Search } from "lucide-react";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { useContacts } from "./api";

export function ContactsPage() {
  const [search, setSearch] = React.useState("");
  const { data, isLoading, isError } = useContacts(search);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
        <Input
          className="pl-9"
          placeholder="Search contacts"
          aria-label="Search contacts"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        {isLoading ? (
          <div className="flex items-center gap-2 p-6 text-text-muted">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Loading contacts…
          </div>
        ) : isError ? (
          <p role="alert" className="p-6 text-base text-danger">
            Could not load contacts.
          </p>
        ) : !data || data.items.length === 0 ? (
          <p className="p-6 text-base text-text-muted">No contacts match that search.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-base">
              <thead>
                <tr className="border-b border-border text-left text-sm text-text-muted">
                  <th className="p-4 font-medium">Name</th>
                  <th className="p-4 font-medium">Company</th>
                  <th className="p-4 font-medium">Phone</th>
                  <th className="p-4 font-medium">Deals</th>
                  <th className="p-4 font-medium">Tags</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/60">
                    <td className="p-4">
                      <Link
                        to={`/contacts/${c.id}`}
                        className="font-medium text-text hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {c.name}
                      </Link>
                      <p className="text-sm text-text-muted">{c.email ?? "—"}</p>
                    </td>
                    <td className="p-4 text-text-muted">{c.company?.name ?? "—"}</td>
                    <td className="p-4 text-text-muted">{c.phone ?? "—"}</td>
                    <td className="p-4 text-text-muted">{c._count.opportunities}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {c.optedOut && <Badge variant="danger">Opted out</Badge>}
                        {c.tags.map((t) => (
                          <Badge key={t}>{t}</Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
