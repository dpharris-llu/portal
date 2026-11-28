"use client";
/**
 * People (F-126): administrators invite colleagues by email, see who has
 * signed in and what Claude has cost for each this month, and can block or
 * restore access. Each invited person gets their own private space.
 */
import { useEffect, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { dollars } from "@/ai/pricing";

type Person = { id: string; email: string; admin: boolean; invitedAt: string | null; invitedBy: string | null; lastSignIn: string | null; blocked: boolean; claudeThisMonth: number };

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

function invitationText(email: string, site: string, from: string) {
  return {
    subject: "You're invited to OratorStudio",
    body: [
      `Hello,`,
      ``,
      `I've invited you to OratorStudio, a workspace for building evidence-based presentations: find and check the evidence, hone your message, and build your slides.`,
      ``,
      `To sign in: go to ${site}/login?email=${encodeURIComponent(email)} and click "Email me a sign-in link". The link arrives at ${email}. No password is needed.`,
      ``,
      `Your presentations are private to you unless you share them.`,
      ``,
      from ? `— ${from}` : ``,
    ].join("\n"),
  };
}

export default function PeoplePage() {
  const [state, setState] = useState<{ admin: boolean; me?: string; people?: Person[] } | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<{ email: string; existing: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () =>
    fetch("/api/people", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Couldn't load people.");
        setState(j);
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function call(method: "POST" | "PATCH", body: unknown) {
    setError("");
    setBusy(true);
    try {
      const r = await fetch("/api/people", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "That didn't work.");
      await load();
      return j;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setCopied(false);
    const r = await call("POST", { email });
    if (r) {
      setSent(r);
      setEmail("");
    }
  }

  const site = typeof window === "undefined" ? "" : window.location.origin;
  const meEmail = state?.people?.find((p) => p.id === state.me)?.email ?? "";
  const letter = sent ? invitationText(sent.email, site, meEmail) : null;

  return (
    <>
      <TopBar />
      <main className="wide stack" style={{ gap: 24 }}>
        <header className="page-head">
          <div>
            <p className="eyebrow">People</p>
            <h1>Who can use OratorStudio</h1>
            <p className="lede">OratorStudio is invite-only. Each person you invite gets their own private space and their own monthly Claude limit; nobody sees anyone else&apos;s presentations.</p>
          </div>
        </header>

        {error && <p className="notice" role="alert">{error}</p>}
        {state && !state.admin && <p className="notice">Only administrators can invite people. Ask an OratorStudio administrator.</p>}

        {state?.admin && (
          <>
            <form className="add-box stack" style={{ gap: 10 }} onSubmit={sendInvite}>
              <strong>Invite someone</strong>
              <div className="row" style={{ alignItems: "flex-end" }}>
                <label style={{ flex: "1 1 260px" }}>
                  Email
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@llu.edu" />
                </label>
                <button className="primary" disabled={busy || !email}>{busy ? "Inviting…" : "Invite"}</button>
              </div>
            </form>

            {sent && letter && (
              <section className="add-box stack" style={{ gap: 10 }} aria-live="polite">
                <strong>{sent.existing ? `${sent.email} already had an account: they can sign in now.` : `${sent.email} is invited.`}</strong>
                <p className="small" style={{ margin: 0 }}>Send them this invitation from your own email, so it comes from someone they know:</p>
                <pre className="small" style={{ whiteSpace: "pre-wrap", margin: 0, padding: 12, background: "var(--panel)", borderRadius: 10 }}>{`Subject: ${letter.subject}\n\n${letter.body}`}</pre>
                <div className="row">
                  <a className="button primary small" href={`mailto:${sent.email}?subject=${encodeURIComponent(letter.subject)}&body=${encodeURIComponent(letter.body)}`}>Open in my email</a>
                  <button
                    className="small"
                    onClick={async () => {
                      await navigator.clipboard.writeText(`${letter.subject}\n\n${letter.body}`);
                      setCopied(true);
                    }}
                  >
                    {copied ? "Copied" : "Copy the text"}
                  </button>
                  <button className="small ghost" onClick={() => setSent(null)}>Done</button>
                </div>
              </section>
            )}

            <h2 className="section-h">Everyone with access ({state.people?.length ?? 0})</h2>
            <div className="list-card" style={{ overflowX: "auto" }}>
              <table className="usage-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Invited</th>
                    <th>Last signed in</th>
                    <th>Claude this month</th>
                    <th>Access</th>
                  </tr>
                </thead>
                <tbody>
                  {(state.people ?? []).map((p) => (
                    <tr key={p.id}>
                      <td>
                        {p.email} {p.admin && <span className="pill navy">Admin</span>} {p.id === state.me && <span className="pill">You</span>}
                      </td>
                      <td className="small">{p.invitedAt ? `${day(p.invitedAt)}${p.invitedBy ? ` by ${p.invitedBy}` : ""}` : <span className="muted">Before invitations</span>}</td>
                      <td className="small">{p.lastSignIn ? day(p.lastSignIn) : <span className="muted">Not yet</span>}</td>
                      <td>{dollars(p.claudeThisMonth)}</td>
                      <td className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                        {p.blocked ? <span className="pill warn">Blocked</span> : <span className="pill ok">Active</span>}
                        {p.id !== state.me && (
                          <>
                            <button className="small ghost" disabled={busy} onClick={() => call("PATCH", { userId: p.id, blocked: !p.blocked })}>{p.blocked ? "Restore" : "Block"}</button>
                            <button className="small ghost" disabled={busy} onClick={() => call("PATCH", { userId: p.id, admin: !p.admin })}>{p.admin ? "Remove admin" : "Make admin"}</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted">Blocking stops someone signing in; their presentations are kept, and Restore gives access back. Administrators can invite people and manage access.</p>
          </>
        )}
      </main>
    </>
  );
}
