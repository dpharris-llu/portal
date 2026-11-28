"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { browserSupabase } from "@/lib/supabase/client";
import { BrandHero } from "@/components/BrandHero";

export default function LoginPage() {
  const supabase = browserSupabase();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  // An invitation links here with the invited address filled in.
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("email");
    if (e) setEmail(e);
  }, []);

  if (!supabase) {
    return (
      <main className="narrow">
        <BrandHero />
        <p>Supabase is not configured, so OratorStudio is running in local mode with no login. Decks are saved in this browser.</p>
        <Link href="/">Go to your decks</Link>
      </main>
    );
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await supabase!.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: false },
    });
    if (error) {
      setState("error");
      // Sign-ups are off: an address nobody invited can't get a link.
      setMessage(/signups? not allowed|not allowed for otp|user not found/i.test(error.message) ? "This email hasn't been invited to OratorStudio. Ask an OratorStudio administrator for an invitation, or check the address." : error.message);
    } else {
      setState("sent");
    }
  }

  return (
    <main className="narrow">
      <BrandHero />
      <h1>Sign in</h1>
      {state === "sent" ? (
        <p role="status">Check {email} for a sign-in link.</p>
      ) : (
        <form onSubmit={send} className="stack">
          <label>
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <button className="primary" disabled={state === "sending"}>
            {state === "sending" ? "Sending…" : "Email me a sign-in link"}
          </button>
          {state === "error" && <p role="alert" className="error">{message}</p>}
        </form>
      )}
    </main>
  );
}
