"use client";
import { useState } from "react";
import Link from "next/link";
import { browserSupabase } from "@/lib/supabase/client";
import { BrandHero } from "@/components/BrandHero";

export default function LoginPage() {
  const supabase = browserSupabase();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

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
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setState("error");
      setMessage(error.message);
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
