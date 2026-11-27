import { NextResponse } from "next/server";
import { getStore } from "@/audience/store";
import { respondWith } from "@/audience/http";
import { serverSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Start an audience session. The returned host key authorizes every presenter action. */
export async function POST() {
  let userId: string | null = null;
  const supabase = await serverSupabase();
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    userId = data.user.id;
  }
  return respondWith(async () => {
    const r = await getStore().create(userId);
    return r.ok ? { ok: true as const, value: { ...r.value, transport: getStore().kind === "supabase" ? "realtime" : "sse" } } : r;
  });
}
