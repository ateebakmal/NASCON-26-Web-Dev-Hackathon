import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button, type ButtonProps } from "./button";

/**
 * Clipboard access throws in insecure contexts and in some browsers, so a
 * failure falls back to a hidden textarea and, failing that, tells the user
 * rather than appearing to succeed.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({
  value,
  label = "Copy link",
  copiedLabel = "Copied",
  ...props
}: { value: string; label?: string; copiedLabel?: string } & Omit<ButtonProps, "onClick">) {
  const [state, setState] = React.useState<"idle" | "copied" | "failed">("idle");

  React.useEffect(() => {
    if (state === "idle") return;
    const id = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(id);
  }, [state]);

  return (
    <Button
      variant="secondary"
      size="sm"
      className="gap-1.5"
      onClick={async () => setState((await copyText(value)) ? "copied" : "failed")}
      {...props}
    >
      {state === "copied" ? (
        <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {state === "copied" ? copiedLabel : state === "failed" ? "Press Ctrl+C" : label}
    </Button>
  );
}
