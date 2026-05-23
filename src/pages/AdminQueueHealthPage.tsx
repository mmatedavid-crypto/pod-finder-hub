import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

// All registered runners already read controls.enabled at start
// (verified via grep). Add to this set if a new runner is added but
// doesn't yet check controls.enabled === false.
const RUNNERS_THAT_RESPECT_PAUSE = new Set<string>([
  "description-cleanup-runner",
  "embed-episode-runner",
  "embed-podcast-runner",
  "embed-chunks-runner",
  "embed-description-runner",
  "seo-enrich-runner",
  "entity-extract-runner",
  "categorize-podcast-runner",
  "rss-hunter",
]);

interface Runner {
  name: string;
  controls_key: string;
  pending_kind: string;
  wake_threshold?: number;
  stall_runs?: number;
}

interface HealthState {
  enabled: boolean;
  dry_run: boolean;
  runners: Runner[];
  history: Record<string, { p1?: number; p2?: number; last_check_at?: string; last_action?: string }>;
  last_check_at?: string;
  last_results?: any[];
}

interface HealthEvent {
  id: string;
  runner: string;
  action: string;
  reason: string | null;
  pending_now: number | null;
  pending_prev: number | null;
  pending_prev_prev: number | null;
  detail: any;
  created_at: string;
}

function fmtAge(iso?: string | null): string {
  if (!iso) return "—";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}

export default function AdminQueueHealthPage() {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<HealthState | null>(null);
  const [controls, setControls] = useState<Record<string, any>>({});
  const [events, setEvents] = useState<HealthEvent[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const [stateRes, ctrlRes, evRes] = await Promise.all([
      supabase.from("app_settings").select("value").eq("key", "queue_health_state").maybeSingle(),
      supabase.from("app_settings").select("key, value").like("key", "%_controls"),
      supabase.from("queue_health_events").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    if (stateRes.error) toast.error("State load: " + stateRes.error.message);
    if (ctrlRes.error) toast.error("Controls load: " + ctrlRes.error.message);
    if (evRes.error) toast.error("Events load: " + evRes.error.message);
    setState((stateRes.data?.value as HealthState) || null);
    const ctrlMap: Record<string, any> = {};
    (ctrlRes.data || []).forEach((r: any) => { ctrlMap[r.key] = r.value; });
    setControls(ctrlMap);
    setEvents((evRes.data as HealthEvent[]) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function saveState(next: HealthState) {
    setBusy(true);
    const { error } = await supabase.from("app_settings").upsert({
      key: "queue_health_state",
      value: next as any,
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" });
    setBusy(false);
    if (error) { toast.error("Save failed: " + error.message); return; }
    setState(next);
    toast.success("Saved");
  }

  async function runNow(dryRun: boolean) {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("queue-health-controller", {
      body: { dry_run: dryRun },
    });
    setBusy(false);
    if (error) { toast.error("Run failed: " + error.message); return; }
    toast.success(`Ran (${dryRun ? "dry" : "live"}): ${data?.results?.length || 0} runners checked`);
    load();
  }

  async function resumeRunner(controlsKey: string) {
    const cur = controls[controlsKey] || {};
    const next = { ...cur, enabled: true };
    delete next.auto_paused_by;
    delete next.auto_paused_reason;
    delete next.auto_paused_at;
    next.manual_resumed_at = new Date().toISOString();
    const { error } = await supabase.from("app_settings").upsert({
      key: controlsKey, value: next, updated_at: new Date().toISOString(),
    }, { onConflict: "key" });
    if (error) { toast.error("Resume failed: " + error.message); return; }
    toast.success("Resumed " + controlsKey);
    load();
  }

  async function updateRunnerField(runnerName: string, field: "wake_threshold" | "stall_runs", value: number) {
    if (!state) return;
    const next: HealthState = {
      ...state,
      runners: state.runners.map(r => r.name === runnerName ? { ...r, [field]: value } : r),
    };
    saveState(next);
  }

  if (loading) return <div className="p-6">Loading…</div>;
  if (!state) return <div className="p-6">No queue_health_state configured.</div>;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Queue Health Controller</h1>
          <p className="text-sm text-muted-foreground">
            Universal pause/resume by pending-queue signal. Last check: {fmtAge(state.last_check_at)}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={!!state.dry_run}
              onCheckedChange={(v) => saveState({ ...state, dry_run: v })}
              disabled={busy}
            />
            Dry run
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={!!state.enabled}
              onCheckedChange={(v) => saveState({ ...state, enabled: v })}
              disabled={busy}
            />
            Controller enabled
          </label>
          <Button size="sm" variant="outline" onClick={() => runNow(true)} disabled={busy}>Run now (dry)</Button>
          <Button size="sm" onClick={() => runNow(false)} disabled={busy}>Run now (live)</Button>
          <Button size="sm" variant="ghost" onClick={load} disabled={busy}>Refresh</Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Runner registry</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Runner</TableHead>
                <TableHead>Pending kind</TableHead>
                <TableHead>Pause support</TableHead>
                <TableHead className="text-right">Pending (now → p1 → p2)</TableHead>
                <TableHead className="text-right">Wake ≥</TableHead>
                <TableHead className="text-right">Stall runs</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead>Auto-pause reason</TableHead>
                <TableHead>Last action</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.runners.map(r => {
                const ctrl = controls[r.controls_key] || {};
                const hist = state.history?.[r.name] || {};
                const lastResult = (state.last_results || []).find((x: any) => x.runner === r.name);
                const supports = RUNNERS_THAT_RESPECT_PAUSE.has(r.name);
                return (
                  <TableRow key={r.name}>
                    <TableCell className="font-mono text-xs">{r.name}</TableCell>
                    <TableCell className="font-mono text-xs">{r.pending_kind}</TableCell>
                    <TableCell>
                      {supports
                        ? <Badge variant="secondary">supported</Badge>
                        : <Badge variant="destructive">needs update</Badge>}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {lastResult?.pending_now ?? "?"} → {hist.p1 ?? "?"} → {hist.p2 ?? "?"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        className="w-20 text-right h-8 ml-auto"
                        defaultValue={r.wake_threshold ?? 5}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v !== (r.wake_threshold ?? 5)) updateRunnerField(r.name, "wake_threshold", v);
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        className="w-20 text-right h-8 ml-auto"
                        defaultValue={r.stall_runs ?? 2}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v !== (r.stall_runs ?? 2)) updateRunnerField(r.name, "stall_runs", v);
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      {ctrl.enabled === false
                        ? <Badge variant="destructive">off</Badge>
                        : <Badge variant="secondary">on</Badge>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {ctrl.auto_paused_reason
                        ? <span><span className="font-mono">{ctrl.auto_paused_reason}</span> <span className="text-muted-foreground">({ctrl.auto_paused_by || "?"})</span></span>
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{hist.last_action || "—"}</div>
                      <div className="text-muted-foreground">{fmtAge(hist.last_check_at)}</div>
                    </TableCell>
                    <TableCell>
                      {ctrl.enabled === false && (
                        <Button size="sm" variant="outline" onClick={() => resumeRunner(r.controls_key)}>Resume</Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent events (last 100)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Runner</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">pending now / p1 / p2</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map(ev => (
                <TableRow key={ev.id}>
                  <TableCell className="text-xs whitespace-nowrap">{fmtAge(ev.created_at)}</TableCell>
                  <TableCell className="font-mono text-xs">{ev.runner}</TableCell>
                  <TableCell>
                    <Badge variant={ev.action.includes("stall") ? "destructive" : ev.action.includes("resume") ? "default" : "secondary"}>
                      {ev.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{ev.reason || "—"}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {ev.pending_now ?? "?"} / {ev.pending_prev ?? "?"} / {ev.pending_prev_prev ?? "?"}
                  </TableCell>
                </TableRow>
              ))}
              {events.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No events yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
