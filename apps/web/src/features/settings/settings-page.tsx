import * as React from "react";
import { cn } from "../../lib/utils";
import { useToolbar } from "../../app/layout";
import { PipelineSettings } from "./pipeline-settings";
import { FieldSettings } from "./field-settings";

const TABS = ["Pipelines", "Fields"] as const;
type Tab = (typeof TABS)[number];

export function SettingsPage() {
  const [tab, setTab] = React.useState<Tab>("Pipelines");

  useToolbar(
    <p className="text-sm text-text-muted">
      Pipelines, stages and fields are data, not code — changes apply immediately and only to this
      workspace.
    </p>,
    []
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={cn(
              "px-3 py-2 text-base font-medium transition-colors motion-reduce:transition-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              tab === t ? "border-b-2 border-primary text-text" : "text-text-muted hover:text-text"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Pipelines" ? <PipelineSettings /> : <FieldSettings />}
    </div>
  );
}
