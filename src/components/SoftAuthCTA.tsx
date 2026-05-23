import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { trackLandingEvent } from "@/lib/landingEvents";
import { toast } from "sonner";

type Props = {
  archetypeId?: string;
  archetypeName?: string;
  pdvCode?: string;
};

const PENDING_KEY = "pending_archetype";

export function SoftAuthCTA({ archetypeId, archetypeName, pdvCode }: Props) {
  const [loading, setLoading] = useState(false);

  const signInGoogle = async () => {
    setLoading(true);
    try {
      try {
        sessionStorage.setItem(PENDING_KEY, JSON.stringify({
          id: archetypeId,
          name: archetypeName,
          pdv: pdvCode,
          at: Date.now(),
        }));
      } catch { /* ignore */ }

      trackLandingEvent("RegistrationStarted", { source: "soft_auth_cta", archetype: archetypeId });

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/my-podiverzum`,
        },
      });
      if (error) {
        toast.error(error.message);
        setLoading(false);
      }
    } catch (e) {
      toast.error((e as Error).message);
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="text-sm font-semibold mb-1">Save your Podiverzum</div>
      <p className="text-sm text-muted-foreground mb-4">
        Sign in to keep your aura, your taste profile, and your recommendations across devices.
      </p>
      <Button onClick={signInGoogle} disabled={loading} className="w-full h-11">
        {loading ? "…" : "Continue with Google"}
      </Button>
      <p className="mt-3 text-xs text-muted-foreground/80">
        No email lists. No third-party tracking.
      </p>
    </div>
  );
}
