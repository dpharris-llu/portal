"use client";
import { browserSupabase } from "@/lib/supabase/client";
import { DEMO } from "@/lib/demo";

export function ModeBanner() {
  if (DEMO)
    return (
      <div className="banner" role="status">
        Demo: everything runs in this browser, and work is saved only here. Audience polls and Q&amp;A from phones need the full app.
      </div>
    );
  if (!browserSupabase())
    return (
      <div className="banner" role="status">
        Local mode: work is saved in this browser only. Set the Supabase variables in <code>.env.local</code> to sign in and sync.
      </div>
    );
  return null;
}
