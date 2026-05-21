import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

interface RunnerStatus {
  name: string;
  spend_key: string;
  controls_key: string | null;
  enabled: boolean | null;
  paused_by: string | null;
  last_run_at: string | null;
  spend_usd: number;
  budget_usd: number;
}

interface WatchdogEvent {
  id: string;
  runner: string;
  rule: string;
  severity: string;
  message: string;
  payload: any;
  auto_paused: boolean;
  alert_sent: boolean;
  created_at: string;
}

function fmtAge(iso: string | null): string {
  if (!iso) return "—";
  const ageMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (ageMin < 60) return `${ageMin}m ago`;
  if (ageMin < 1440) return `${Math.round(ageMin / 60)}h ago`;
  return `${Math.round(ageMin / 1440)}d ago`;
}

export default function AdminPipelineWatchdogPage() {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<any>({});
  const [status, setStatus] = useState<RunnerStatus[]>([]);
  const [events, setEvents] = useState<WatchdogEvent[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("pipeline-watchdog-admin", { body: { action: "status" } });
    if (error) {
      toast.error("Failed to load: " + error.message);
    } else {
      setState(data?.state || {});
      setStatus(data?.status || []);
      setEvents(data?.events || []);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function patchState(patch: any) {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("pipeline-watchdog-admin", { body: { action: "set_state", patch } });
    if (error) toast.error(error.message);
    else { setState(data?.state || {}); toast.success("Saved"); }
    setBusy(false);
  }

  async function resume(controls_key: string) {
    setBusy(true);
    const { error } = await supabase.functions.invoke("pipeline-watchdog-admin", { body: { action: "resume_runner", controls_key } });
    if (error) toast.error(error.message); else { toast.success(`Resumed ${controls_key}`); load(); }
    setBusy(false);
  }

  async function runNow() {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("pipeline-watchdog-admin", { body: { action: "run_now" } });
    if (error) toast.error(error.message);
    else { toast.success(`Run complete: ${data?.result?.incidents ?? 0} incidents`); load(); }
    setBusy(false);
  }

  async function testTelegram() {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("pipeline-watchdog-admin", { body: { action: "test_telegram" } });
    if (error || !data?.ok) toast.error(`Telegram failed: ${error?.message || data?.error}`);
    else toast.success("Telegram test sent");
    setBusy(false);
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Pipeline Watchdog</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading || busy}>Refresh</Button>
          <Button variant="outline" onClick={testTelegram} disabled={busy}>Test Telegram</Button>
          <Button onClick={runNow} disabled={busy}>Run Now</Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Master controls</CardTitle></CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-6">
          <label className="flex items-center gap-3">
            <Switch checked={state.enabled !== false} onCheckedChange={(v) => patchState({ enabled: v })} disabled={busy} />
            <span>Watchdog enabled</span>
          </label>
          <label className="flex items-center gap-3">
            <Switch checked={state.dry_run !== false} onCheckedChange={(v) => patchState({ dry_run: v })} disabled={busy} />
            <span>Dry-run (alerts only, no auto-pause)</span>
          </label>
          <div className="text-sm text-muted-foreground self-center">
            Dedup: {state.alert_dedup_minutes ?? 30}m · Stale: {state.stale_lock_minutes ?? 60}m · Overshoot: ×{state.budget_overshoot_ratio ?? 1.2}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Runners ({status.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Runner</TableHead>
              <TableHead>Spend / Budget</TableHead>
              <TableHead>Last run</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {status.map((r) => {
                const pct = r.budget_usd > 0 ? (r.spend_usd / r.budget_usd) * 100 : 0;
                const overBudget = r.budget_usd > 0 && r.spend_usd >= r.budget_usd;
                return (
                  <TableRow key={r.name}>
                    <TableCell className="font-medium">{r.name}<div className="text-xs text-muted-foreground">{r.spend_key}</div></TableCell>
                    <TableCell className={overBudget ? "text-destructive" : ""}>${r.spend_usd.toFixed(3)} / ${r.budget_usd.toFixed(2)} {r.budget_usd > 0 && <span className="text-xs text-muted-foreground">({pct.toFixed(0)}%)</span>}</TableCell>
                    <TableCell>{fmtAge(r.last_run_at)}</TableCell>
                    <TableCell>
                      {r.enabled === null ? <Badge variant="outline">no controls</Badge>
                        : r.enabled ? <Badge variant="secondary">enabled</Badge>
                        : <Badge variant="destructive">paused{r.paused_by ? ` by ${r.paused_by}` : ""}</Badge>}
                    </TableCell>
                    <TableCell>
                      {r.controls_key && r.enabled === false && (
                        <Button size="sm" variant="outline" onClick={() => resume(r.controls_key!)} disabled={busy}>Resume</Button>
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
        <CardHeader><CardTitle>Recent events ({events.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>When</TableHead>
              <TableHead>Runner</TableHead>
              <TableHead>Rule</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Flags</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs whitespace-nowrap">{fmtAge(e.created_at)}</TableCell>
                  <TableCell className="font-medium">{e.runner}</TableCell>
                  <TableCell>{e.rule}</TableCell>
                  <TableCell>
                    <Badge variant={e.severity === "critical" ? "destructive" : e.severity === "warn" ? "secondary" : "outline"}>{e.severity}</Badge>
                  </TableCell>
                  <TableCell className="max-w-md text-sm">{e.message}</TableCell>
                  <TableCell className="text-xs">
                    {e.alert_sent && <Badge variant="outline" className="mr-1">📨 sent</Badge>}
                    {e.auto_paused && <Badge variant="destructive">⛔ paused</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
