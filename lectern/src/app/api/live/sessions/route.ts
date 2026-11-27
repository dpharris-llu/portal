import { NextResponse } from "next/server";
import { store } from "@/audience/store";
import { serverSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Start an audience session. The host key authorizes every presenter action. */
export async function POST() {
  const supabase = await serverSupabase();
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const s = store.create();
  return NextResponse.json({ id: s.id, code: s.code, hostKey: s.hostKey });
}
