"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { browserSupabase } from "@/lib/supabase/client";
import { Wordmark } from "./Wordmark";

export function TopBar({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  const sb = browserSupabase();
  return (
    <header className="topbar">
      <Link href="/" aria-label="OratorStudio home"><Wordmark size={22} /></Link>
      {children}
      <span className="spacer" />
      {sb && (
        <button
          className="ghost"
          onClick={async () => {
            await sb.auth.signOut();
            router.push("/login");
          }}
        >
          Sign out
        </button>
      )}
    </header>
  );
}
