import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export default function UnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [state, setState] = useState<"loading" | "valid" | "already" | "invalid" | "done" | "error">("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    (async () => {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`, { headers: { apikey: ANON } });
        const j = await r.json();
        if (j.valid === true) setState("valid");
        else if (j.reason === "already_unsubscribed") setState("already");
        else setState("invalid");
      } catch { setState("error"); }
    })();
  }, [token]);

  const confirm = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/handle-email-unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON },
        body: JSON.stringify({ token }),
      });
      const j = await r.json();
      setState(j.success ? "done" : "already");
    } catch { setState("error"); }
    setBusy(false);
  };

  return (
    <Layout>
      <Seo title="Unsubscribe | Podiverzum" noindex />
      <div className="container mx-auto py-16 max-w-md text-center">
        <h1 className="text-2xl font-semibold mb-4">Unsubscribe</h1>
        {state === "loading" && <p className="text-muted-foreground">Checking link…</p>}
        {state === "valid" && (
          <>
            <p className="text-muted-foreground mb-6">Click below to confirm and stop receiving emails.</p>
            <Button onClick={confirm} disabled={busy}>{busy ? "Working…" : "Confirm unsubscribe"}</Button>
          </>
        )}
        {state === "done" && <p className="text-emerald-600">You have been unsubscribed.</p>}
        {state === "already" && <p className="text-muted-foreground">This email is already unsubscribed.</p>}
        {state === "invalid" && <p className="text-destructive">Invalid or expired link.</p>}
        {state === "error" && <p className="text-destructive">Something went wrong. Please try again.</p>}
      </div>
    </Layout>
  );
}
