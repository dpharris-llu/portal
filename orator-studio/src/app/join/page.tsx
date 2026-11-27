"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/Wordmark";

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  return (
    <main className="phone">
      <Wordmark size={26} tagline />
      <h1>Join a presentation</h1>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const c = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
          if (c) router.push(`/j/${c}`);
        }}
      >
        <label>
          Code on the screen
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="ABC 234"
            style={{ fontSize: 24, letterSpacing: "0.1em", textTransform: "uppercase" }}
          />
        </label>
        <button className="primary" style={{ padding: 12, fontSize: 18 }}>Join</button>
      </form>
      <p className="small muted">No account needed. Your responses are anonymous.</p>
    </main>
  );
}
