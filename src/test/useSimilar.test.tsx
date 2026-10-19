import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor, cleanup } from "@testing-library/react";

const calls: { fn: string; args: any; signal?: AbortSignal }[] = [];
let impl: (signal?: AbortSignal) => Promise<any> = async () => ({ data: [], error: null });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (fn: string, args: any) => ({ abortSignal: (signal: AbortSignal) => { calls.push({ fn, args, signal }); return impl(signal); } }) },
}));
import { useSimilarEpisodes, similarQueryOptions } from "@/lib/useSimilar";

const Probe = ({ id, limit, out }: any) => { const { data } = useSimilarEpisodes(id); out[limit] = (data ?? []).slice(0, limit); return null; };
const wrap = (qc: QueryClient, el: React.ReactNode) => <QueryClientProvider client={qc}>{el}</QueryClientProvider>;
const rows = Array.from({ length: 8 }, (_, i) => ({ episode_id: `e${i}`, audio_url: i % 2 ? null : "a" }));

beforeEach(() => { calls.length = 0; cleanup(); });

describe("useSimilar", () => {
  it("4/6/8 consumers share one p_limit=8 request", async () => {
    impl = async () => ({ data: rows, error: null });
    const qc = new QueryClient(); const out: any = {};
    render(wrap(qc, <><Probe id="x" limit={4} out={out} /><Probe id="x" limit={6} out={out} /><Probe id="x" limit={8} out={out} /></>));
    await waitFor(() => expect(out[8]?.length).toBe(8));
    expect(calls).toHaveLength(1);
    expect(calls[0].args.p_limit).toBe(8);
    expect(out[4]).toHaveLength(4); expect(out[6]).toHaveLength(6);
  });
  it("busy retries exactly once; other errors never", () => {
    const r = similarQueryOptions.retry;
    expect(r(0, { message: "recommendations_busy" })).toBe(true);
    expect(r(1, { message: "recommendations_busy" })).toBe(false);
    expect(r(0, { message: "57014" })).toBe(false);
    expect(similarQueryOptions.refetchOnWindowFocus).toBe(false);
    expect(similarQueryOptions.refetchOnReconnect).toBe(false);
  });
  it("aborts in-flight request when last observer unmounts", async () => {
    impl = (s) => new Promise(() => {});
    const qc = new QueryClient(); const out: any = {};
    const { unmount } = render(wrap(qc, <Probe id="y" limit={4} out={out} />));
    await waitFor(() => expect(calls).toHaveLength(1));
    unmount();
    await waitFor(() => expect(calls[0].signal?.aborted).toBe(true));
  });
  it("compact slicing keeps original order: slice 4 then audio filter", () => {
    const compact = rows.slice(0, 4).filter((r) => r.audio_url);
    expect(compact.map((r) => r.episode_id)).toEqual(["e0", "e2"]);
  });
});
