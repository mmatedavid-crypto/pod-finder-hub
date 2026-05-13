import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Seo } from "@/components/Seo";
import Layout from "@/components/Layout";
import { Loader2, RefreshCcw, Sparkles, Send, Copy, Check, X, ExternalLink, Plus, Trash2 } from "lucide-react";

const TEMP_ADMIN_USER_ID = "7b92654a-2b5d-438c-ad67-7ad5f6709483";

type WatchAccount = {
  id: string;
  x_handle: string;
  display_name: string | null;
  person_slug: string | null;
  default_podiverzum_url: string | null;
  is_active: boolean;
  priority: number;
  notes: string | null;
  last_checked_at: string | null;
};

type WatchedPost = {
  id: string;
  x_post_id: string;
  x_handle: string;
  post_text: string | null;
  post_url: string;
  posted_at: string | null;
  matched_person_slug: string | null;
  matched_podiverzum_url: string | null;
  match_reason: string | null;
  status: string;
};

type Suggestion = {
  id: string;
  watched_post_id: string;
  variant: string | null;
  suggestion_text: string;
  podiverzum_url: string;
  status: string;
  x_reply_id: string | null;
  error_message: string | null;
};

export default function AdminXReplyAssistantPage() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accounts, setAccounts] = useState<WatchAccount[]>([]);
  const [posts, setPosts] = useState<WatchedPost[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<string>("active");

  // new account form
  const [newAcc, setNewAcc] = useState({ x_handle: "", display_name: "", person_slug: "", default_podiverzum_url: "", priority: 50, notes: "" });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) { nav("/auth"); return; }
      const { data: hasAdmin } = await (supabase as any).rpc("has_role", { _user_id: uid, _role: "admin" });
      const admin = hasAdmin === true || uid === TEMP_ADMIN_USER_ID;
      setIsAdmin(admin);
      setReady(true);
      if (admin) { loadAll(); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav]);

  const loadAll = async () => {
    await Promise.all([loadAccounts(), loadPosts()]);
  };

  const loadAccounts = async () => {
    const { data } = await (supabase as any).from("x_watch_accounts").select("*").order("priority", { ascending: false });
    setAccounts((data || []) as WatchAccount[]);
  };

  const loadPosts = async () => {
    let q = (supabase as any).from("x_watched_posts").select("*").order("detected_at", { ascending: false }).limit(50);
    if (statusFilter === "active") q = q.in("status", ["new", "needs_review", "suggested", "approved"]);
    else if (statusFilter !== "all") q = q.eq("status", statusFilter);
    const { data } = await q;
    setPosts((data || []) as WatchedPost[]);
    // load suggestions for visible posts
    const ids = (data || []).map((p: any) => p.id);
    if (ids.length) {
      const { data: sg } = await (supabase as any).from("x_reply_suggestions").select("*").in("watched_post_id", ids).order("created_at", { ascending: true });
      const map: Record<string, Suggestion[]> = {};
      for (const s of (sg || []) as Suggestion[]) {
        (map[s.watched_post_id] = map[s.watched_post_id] || []).push(s);
      }
      setSuggestions(map);
    } else setSuggestions({});
  };

  useEffect(() => { if (isAdmin) loadPosts(); /* eslint-disable-next-line */ }, [statusFilter]);

  const runMonitor = async (handle?: string) => {
    setBusy("monitor"); setMsg("");
    const { data, error } = await supabase.functions.invoke("x-monitor-watchlist", {
      body: handle ? { handles: [handle] } : {},
    });
    setBusy(null);
    if (error) { setMsg(`Monitor failed: ${error.message}`); return; }
    setMsg(`Monitor: ${(data as any)?.inserted ?? 0} new posts, ${(data as any)?.accounts ?? 0} accounts checked.`);
    loadAll();
  };

  const generate = async (postId: string) => {
    setBusy("gen-" + postId); setMsg("");
    const { data, error } = await supabase.functions.invoke("x-generate-reply-suggestions", {
      body: { watched_post_id: postId },
    });
    setBusy(null);
    if (error) { setMsg(`Generate failed: ${error.message}`); return; }
    if ((data as any)?.skipped) setMsg(`AI skipped: ${(data as any).reason || ""}`);
    loadPosts();
  };

  const setSuggestionStatus = async (id: string, status: string) => {
    const updates: any = { status };
    if (status === "approved") { updates.approved_at = new Date().toISOString(); }
    await (supabase as any).from("x_reply_suggestions").update(updates).eq("id", id);
    loadPosts();
  };

  const saveEdit = async (s: Suggestion) => {
    const text = editing[s.id];
    if (!text) return;
    await (supabase as any).from("x_reply_suggestions").update({ suggestion_text: text, status: "draft" }).eq("id", s.id);
    setEditing((e) => { const c = { ...e }; delete c[s.id]; return c; });
    loadPosts();
  };

  const post = async (suggestionId: string) => {
    setBusy("post-" + suggestionId); setMsg("");
    const { data, error } = await supabase.functions.invoke("x-post-approved-reply", {
      body: { suggestion_id: suggestionId },
    });
    setBusy(null);
    if (error || !(data as any)?.ok) {
      setMsg(`Post failed: ${(data as any)?.error || error?.message || "unknown"}`);
    } else {
      setMsg(`Posted: ${(data as any).x_reply_url || "ok"}`);
    }
    loadPosts();
  };

  const copyText = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setMsg("Copied to clipboard."); } catch { setMsg("Copy failed."); }
  };

  const skipPost = async (postId: string) => {
    await (supabase as any).from("x_watched_posts").update({ status: "skipped" }).eq("id", postId);
    loadPosts();
  };
  const markIrrelevant = async (postId: string) => {
    await (supabase as any).from("x_watched_posts").update({ status: "ignored" }).eq("id", postId);
    loadPosts();
  };

  const addAccount = async () => {
    if (!newAcc.x_handle.trim()) return;
    const handle = newAcc.x_handle.trim().replace(/^@/, "");
    const slug = newAcc.person_slug.trim() || null;
    const defaultUrl = newAcc.default_podiverzum_url.trim() || (slug ? `https://podiverzum.com/person/${slug}` : null);
    const { error } = await (supabase as any).from("x_watch_accounts").insert({
      x_handle: handle,
      display_name: newAcc.display_name.trim() || null,
      person_slug: slug,
      default_podiverzum_url: defaultUrl,
      priority: Number(newAcc.priority) || 50,
      notes: newAcc.notes.trim() || null,
      is_active: true,
    });
    if (error) setMsg(`Add failed: ${error.message}`);
    else { setNewAcc({ x_handle: "", display_name: "", person_slug: "", default_podiverzum_url: "", priority: 50, notes: "" }); loadAccounts(); }
  };

  const toggleActive = async (a: WatchAccount) => {
    await (supabase as any).from("x_watch_accounts").update({ is_active: !a.is_active }).eq("id", a.id);
    loadAccounts();
  };
  const removeAccount = async (id: string) => {
    if (!confirm("Remove this watch account?")) return;
    await (supabase as any).from("x_watch_accounts").delete().eq("id", id);
    loadAccounts();
  };

  if (!ready) return <Layout><div className="container mx-auto py-20 text-muted-foreground">Loading…</div></Layout>;
  if (!isAdmin) return <Layout><div className="container mx-auto py-20 max-w-md"><h1 className="text-2xl font-semibold">Not authorized</h1></div></Layout>;

  return (
    <Layout>
      <Seo title="X Reply Assistant — Admin" noindex />
      <div className="container mx-auto py-6 sm:py-10 max-w-6xl space-y-8">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold">X Reply Assistant</h1>
            <p className="text-xs text-muted-foreground">Detect → match → suggest → human approves → copy or post. No automatic replies.</p>
          </div>
          <button onClick={() => runMonitor()} disabled={busy === "monitor"} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-card hover:bg-secondary text-sm">
            {busy === "monitor" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} Run monitor now
          </button>
        </header>

        {msg && <div className="rounded-md border border-border bg-card px-3 py-2 text-sm">{msg}</div>}

        {/* Watch accounts */}
        <section className="space-y-3">
          <h2 className="text-sm uppercase tracking-wider text-muted-foreground">Watch accounts</h2>
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-secondary/50">
                <tr>
                  <th className="text-left px-3 py-2">Handle</th>
                  <th className="text-left px-3 py-2">Display</th>
                  <th className="text-left px-3 py-2">Person slug</th>
                  <th className="text-left px-3 py-2">Default URL</th>
                  <th className="text-left px-3 py-2">Prio</th>
                  <th className="text-left px-3 py-2">Active</th>
                  <th className="text-left px-3 py-2">Last check</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono">@{a.x_handle}</td>
                    <td className="px-3 py-2">{a.display_name || "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{a.person_slug || "—"}</td>
                    <td className="px-3 py-2 text-xs truncate max-w-[260px]"><a href={a.default_podiverzum_url || "#"} target="_blank" rel="noreferrer" className="text-accent underline">{a.default_podiverzum_url || "—"}</a></td>
                    <td className="px-3 py-2">{a.priority}</td>
                    <td className="px-3 py-2"><button onClick={() => toggleActive(a)} className={`px-2 py-0.5 rounded text-[11px] border ${a.is_active ? "bg-green-500/10 text-green-400 border-green-500/30" : "bg-secondary border-border text-muted-foreground"}`}>{a.is_active ? "active" : "off"}</button></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{a.last_checked_at ? new Date(a.last_checked_at).toLocaleString() : "—"}</td>
                    <td className="px-3 py-2 flex gap-2">
                      <button onClick={() => runMonitor(a.x_handle)} className="text-xs px-2 py-1 rounded border border-border hover:bg-secondary"><RefreshCcw className="h-3 w-3" /></button>
                      <button onClick={() => removeAccount(a.id)} className="text-xs px-2 py-1 rounded border border-border hover:bg-destructive/10 text-destructive"><Trash2 className="h-3 w-3" /></button>
                    </td>
                  </tr>
                ))}
                {accounts.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">No accounts yet. Add one below.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-border bg-card p-3 grid grid-cols-1 sm:grid-cols-6 gap-2 text-sm">
            <input className="bg-background border border-border rounded px-2 py-1.5" placeholder="x_handle (e.g. sama)" value={newAcc.x_handle} onChange={(e) => setNewAcc({ ...newAcc, x_handle: e.target.value })} />
            <input className="bg-background border border-border rounded px-2 py-1.5" placeholder="Display name" value={newAcc.display_name} onChange={(e) => setNewAcc({ ...newAcc, display_name: e.target.value })} />
            <input className="bg-background border border-border rounded px-2 py-1.5" placeholder="person_slug (e.g. sam-altman)" value={newAcc.person_slug} onChange={(e) => setNewAcc({ ...newAcc, person_slug: e.target.value })} />
            <input className="bg-background border border-border rounded px-2 py-1.5 sm:col-span-2" placeholder="Default Podiverzum URL (optional)" value={newAcc.default_podiverzum_url} onChange={(e) => setNewAcc({ ...newAcc, default_podiverzum_url: e.target.value })} />
            <button onClick={addAccount} className="inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm"><Plus className="h-4 w-4" /> Add</button>
          </div>
        </section>

        {/* Detected posts */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-sm uppercase tracking-wider text-muted-foreground">Detected posts</h2>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-background border border-border rounded px-2 py-1 text-xs">
              <option value="active">Active (new/review/suggested/approved)</option>
              <option value="all">All</option>
              <option value="new">new</option>
              <option value="needs_review">needs_review</option>
              <option value="suggested">suggested</option>
              <option value="approved">approved</option>
              <option value="posted">posted</option>
              <option value="skipped">skipped</option>
              <option value="ignored">ignored</option>
            </select>
          </div>

          <div className="space-y-3">
            {posts.map((p) => {
              const sg = suggestions[p.id] || [];
              return (
                <div key={p.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="font-mono">@{p.x_handle}</span>
                      <span className="text-muted-foreground">{p.posted_at ? new Date(p.posted_at).toLocaleString() : ""}</span>
                      <span className="px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border border-border">{p.status}</span>
                      <a href={p.post_url} target="_blank" rel="noreferrer" className="text-accent underline inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" /> open on X</a>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => generate(p.id)} disabled={busy === "gen-" + p.id || !p.matched_podiverzum_url} className="text-xs inline-flex items-center gap-1 px-2.5 py-1 rounded border border-border hover:bg-secondary disabled:opacity-50">
                        {busy === "gen-" + p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Generate
                      </button>
                      <button onClick={() => skipPost(p.id)} className="text-xs px-2.5 py-1 rounded border border-border hover:bg-secondary">Skip</button>
                      <button onClick={() => markIrrelevant(p.id)} className="text-xs px-2.5 py-1 rounded border border-border hover:bg-secondary">Irrelevant</button>
                    </div>
                  </div>
                  <div className="text-sm whitespace-pre-wrap">{p.post_text || <em className="text-muted-foreground">(no text)</em>}</div>
                  <div className="text-xs text-muted-foreground">
                    Matched: {p.matched_podiverzum_url ? <a className="text-accent underline" href={p.matched_podiverzum_url} target="_blank" rel="noreferrer">{p.matched_podiverzum_url}</a> : <span className="text-destructive">no match — set one before generating</span>}
                    {p.match_reason && <div className="mt-1 italic">{p.match_reason}</div>}
                  </div>

                  {sg.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-border">
                      {sg.map((s) => {
                        const isEditing = editing[s.id] !== undefined;
                        return (
                          <div key={s.id} className="rounded border border-border bg-background p-3 space-y-2">
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              <span className="px-1.5 py-0.5 rounded bg-secondary border border-border uppercase">{s.variant || "variant"}</span>
                              <span className="px-1.5 py-0.5 rounded bg-secondary border border-border">{s.status}</span>
                              <span>{s.suggestion_text.length} chars</span>
                              {s.error_message && <span className="text-destructive truncate">⚠ {s.error_message}</span>}
                            </div>
                            {isEditing ? (
                              <textarea value={editing[s.id]} onChange={(e) => setEditing({ ...editing, [s.id]: e.target.value })} rows={4} className="w-full bg-background border border-border rounded p-2 text-sm font-mono" />
                            ) : (
                              <div className="text-sm whitespace-pre-wrap">{s.suggestion_text}</div>
                            )}
                            <div className="flex flex-wrap gap-2">
                              {!isEditing && <button onClick={() => setEditing({ ...editing, [s.id]: s.suggestion_text })} className="text-xs px-2 py-1 rounded border border-border hover:bg-secondary">Edit</button>}
                              {isEditing && <button onClick={() => saveEdit(s)} className="text-xs px-2 py-1 rounded border border-border hover:bg-secondary">Save</button>}
                              {isEditing && <button onClick={() => setEditing((e) => { const c = { ...e }; delete c[s.id]; return c; })} className="text-xs px-2 py-1 rounded border border-border hover:bg-secondary">Cancel</button>}
                              <button onClick={() => copyText(s.suggestion_text)} className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-secondary"><Copy className="h-3 w-3" /> Copy reply</button>
                              {s.status === "draft" && <button onClick={() => setSuggestionStatus(s.id, "approved")} className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded border border-green-500/30 text-green-400 hover:bg-green-500/10"><Check className="h-3 w-3" /> Approve</button>}
                              {s.status === "approved" && <button onClick={() => setSuggestionStatus(s.id, "draft")} className="text-xs px-2 py-1 rounded border border-border hover:bg-secondary">Unapprove</button>}
                              {s.status === "approved" && <button onClick={() => post(s.id)} disabled={busy === "post-" + s.id} className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50">{busy === "post-" + s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Post now</button>}
                              {s.status !== "rejected" && s.status !== "posted" && <button onClick={() => setSuggestionStatus(s.id, "rejected")} className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-destructive/10 text-destructive"><X className="h-3 w-3" /> Reject</button>}
                              {s.x_reply_id && <a href={`https://x.com/i/web/status/${s.x_reply_id}`} target="_blank" rel="noreferrer" className="text-xs inline-flex items-center gap-1 text-accent underline"><ExternalLink className="h-3 w-3" /> view on X</a>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {posts.length === 0 && <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground text-sm">No posts. Add a watch account and run the monitor.</div>}
          </div>
        </section>
      </div>
    </Layout>
  );
}
