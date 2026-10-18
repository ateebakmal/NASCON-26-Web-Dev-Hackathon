import * as React from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Loader2, Search } from "lucide-react";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { useContacts, type ContactRow } from "./api";
import { ContactDetailView } from "./contact-detail-view";

export function ContactsPage() {
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<ContactRow | null>(null);
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

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Deals</TableHead>
              <TableHead>Tags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableEmpty colSpan={5}>
                <span className="inline-flex items-center gap-2">
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  Loading contacts…
                </span>
              </TableEmpty>
            )}

            {isError && (
              <TableEmpty colSpan={5}>
                <span role="alert" className="text-danger">
                  Could not load contacts.
                </span>
              </TableEmpty>
            )}

            {!isLoading && !isError && data?.items.length === 0 && (
              <TableEmpty colSpan={5}>No contacts match that search.</TableEmpty>
            )}

            {!isLoading &&
              !isError &&
              data?.items.map((c) => (
                // The whole row opens the detail drawer. It's a real button
                // for keyboard and screen-reader users rather than a row with
                // a click handler bolted on.
                <TableRow
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(c)}
                  data-state={selected?.id === c.id ? "selected" : undefined}
                >
                  <TableCell>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(c);
                      }}
                      className="text-left font-medium text-text hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {c.name}
                    </button>
                    <p className="text-sm text-text-muted">{c.email ?? "—"}</p>
                  </TableCell>
                  <TableCell className="text-text-muted">{c.company?.name ?? "—"}</TableCell>
                  <TableCell className="text-text-muted">{c.phone ?? "—"}</TableCell>
                  <TableCell className="text-text-muted">{c._count.opportunities}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {c.optedOut && <Badge variant="danger">Opted out</Badge>}
                      {c.tags.map((t) => (
                        <Badge key={t}>{t}</Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>{selected?.name}</SheetTitle>
            <SheetDescription>
              {selected?.company?.name ?? "No company"} · {selected?.phone ?? "—"}
            </SheetDescription>
            {selected && (
              <Link
                to={`/contacts/${selected.id}`}
                className="mt-1 flex w-fit items-center gap-1.5 text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Open full page
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            )}
          </SheetHeader>
          <SheetBody>
            <ContactDetailView contactId={selected?.id} />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}
