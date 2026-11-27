import { NextResponse } from "next/server";
import { fullText, SearchError } from "@/find/server";
import { serverSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Open-access full text from PubMed Central for a paper the author chose to add (F-119). */
export async function POST(request: Request) {
  const supabase = await serverSupabase();
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  if (typeof body?.pmcid !== "string") return NextResponse.json({ error: "Give a PubMed Central id." }, { status: 400 });
  try {
    return NextResponse.json(await fullText(body.pmcid));
  } catch (e) {
    if (e instanceof SearchError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("Full text failed", e);
    return NextResponse.json({ error: "The full text couldn't be fetched." }, { status: 502 });
  }
}
