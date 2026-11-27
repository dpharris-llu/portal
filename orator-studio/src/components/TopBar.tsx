"use client";
/**
 * The app frame: module navigation (sidebar, rail or tab bar, by screen size)
 * plus a top bar for the page's own title and actions. `compact` keeps the
 * narrow rail on wide screens, for work surfaces like the slide editor.
 */
import { useRouter } from "next/navigation";
import { browserSupabase } from "@/lib/supabase/client";
import { ModuleNav } from "./ModuleNav";

export function TopBar({ children, compact = false }: { children?: React.ReactNode; compact?: boolean }) {
  const router = useRouter();
  const sb = browserSupabase();
  return (
    <>
      <ModuleNav compact={compact} />
      {(children || sb) && (
        <header className="topbar">
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
      )}
    </>
  );
}
