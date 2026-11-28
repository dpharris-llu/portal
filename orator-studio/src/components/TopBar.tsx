"use client";
/**
 * The app frame: module navigation (sidebar, rail or tab bar, by screen size)
 * plus a top bar for the page's own title and actions. `compact` keeps the
 * narrow rail on wide screens, for work surfaces like the slide editor.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { browserSupabase } from "@/lib/supabase/client";
import { ModuleNav } from "./ModuleNav";

export function TopBar({ children, compact = false }: { children?: React.ReactNode; compact?: boolean }) {
  const router = useRouter();
  const sb = browserSupabase();
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    if (!sb) return;
    fetch("/api/people", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setAdmin(Boolean(j.admin)))
      .catch(() => {});
  }, [Boolean(sb)]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <ModuleNav compact={compact} />
      {(children || sb) && (
        <header className="topbar">
          {children}
          <span className="spacer" />
          {admin && (
            <Link href="/people" className="ghost-link">
              People
            </Link>
          )}
          {sb && (
            <Link href="/usage" className="ghost-link">
              Claude usage
            </Link>
          )}
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
      )}
    </>
  );
}
