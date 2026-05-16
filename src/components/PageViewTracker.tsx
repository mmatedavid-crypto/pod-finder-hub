import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const SKIP_PREFIXES = ["/admin", "/auth", "/growth-status", "/admin-bootstrap"];

const VID_KEY = "pdv_vid";
const SID_KEY = "pdv_sid";
const SID_TS_KEY = "pdv_sid_ts";
const COUNTRY_KEY = "pdv_country";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 min

function getVisitorId(): string {
  try {
    let v = localStorage.getItem(VID_KEY);
    if (!v) {
      v = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(VID_KEY, v);
    }
    return v;
  } catch {
    return "anon";
  }
}

function getSessionId(): string {
  try {
    const now = Date.now();
    const lastTs = Number(sessionStorage.getItem(SID_TS_KEY) || localStorage.getItem(SID_TS_KEY) || 0);
    let sid = sessionStorage.getItem(SID_KEY) || localStorage.getItem(SID_KEY);
    if (!sid || !lastTs || now - lastTs > SESSION_TIMEOUT_MS) {
      sid = (crypto.randomUUID?.() ?? `${now}-${Math.random().toString(36).slice(2)}`);
      sessionStorage.setItem(SID_KEY, sid);
      localStorage.setItem(SID_KEY, sid);
    }
    sessionStorage.setItem(SID_TS_KEY, String(now));
    localStorage.setItem(SID_TS_KEY, String(now));
    return sid;
  } catch {
    return "anon";
  }
}

let countryPromise: Promise<string | null> | null = null;
async function getCountry(): Promise<string | null> {
  try {
    const cached = sessionStorage.getItem(COUNTRY_KEY);
    if (cached !== null) return cached || null;
  } catch { /* ignore */ }
  if (!countryPromise) {
    countryPromise = (async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/geo`;
        const res = await fetch(url, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string },
        });
        if (!res.ok) return null;
        const j = await res.json();
        const c = (j?.country as string | null) || null;
        try { sessionStorage.setItem(COUNTRY_KEY, c ?? ""); } catch { /* ignore */ }
        return c;
      } catch {
        return null;
      }
    })();
  }
  return countryPromise;
}

export default function PageViewTracker() {
  const location = useLocation();
  const lastLogged = useRef<string | null>(null);

  useEffect(() => {
    const path = location.pathname;
    if (SKIP_PREFIXES.some((p) => path === p || path.startsWith(p + "/"))) return;

    const key = path + location.search;
    if (lastLogged.current === key) return;
    lastLogged.current = key;

    (async () => {
      try {
        const visitor_id = getVisitorId();
        const session_id = getSessionId();
        const country = await getCountry();
        const { data } = await supabase.auth.getSession();
        const uid = data.session?.user.id ?? null;
        const params = new URLSearchParams(location.search);
        const utm = (k: string) => params.get(k) || null;
        await supabase.from("page_events").insert({
          path,
          full_url: window.location.href,
          referrer: document.referrer || null,
          viewport_width: window.innerWidth,
          user_agent: navigator.userAgent || null,
          user_id: uid,
          visitor_id,
          session_id,
          country,
          utm_source: utm("utm_source"),
          utm_medium: utm("utm_medium"),
          utm_campaign: utm("utm_campaign"),
          utm_term: utm("utm_term"),
          utm_content: utm("utm_content"),
        });
      } catch {
        /* swallow — analytics must never break the app */
      }
    })();
  }, [location.pathname, location.search]);

  return null;
}
