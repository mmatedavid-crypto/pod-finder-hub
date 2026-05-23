// Lightweight client helper that logs a swipe to taste_interactions.
// Fire-and-forget: never blocks the UI, never throws to the caller.

import { supabase } from "@/integrations/supabase/client";
import { getAnonymousSessionId } from "./landingEvents";

export type SwipeAction = "like" | "skip" | "super";

export function logSwipe(cardId: string, action: SwipeAction, swipeIndex: number): void {
  try {
    void supabase.auth.getSession().then(({ data }) => {
      const userId = data.session?.user?.id ?? null;
      supabase.from("taste_interactions").insert({
        anonymous_session_id: getAnonymousSessionId(),
        user_id: userId,
        card_id: cardId,
        action,
        swipe_index: swipeIndex,
      }).then(
        ({ error }) => { if (error) console.warn("[taste_interactions] insert failed", error.message); },
        () => { /* swallow */ },
      );
    });
  } catch {
    /* never break the app */
  }
}
