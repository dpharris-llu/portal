import { NextResponse } from "next/server";
import { z } from "zod";
import { landscape } from "@/find/server";
import { cleanSelection } from "@/find/catalog";
import { serverSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ query: z.string().min(2).max(4000), words: z.string().min(2).max(300), broader: z.string().max(4000).optional(), sources: z.array(z.string().max(40)).max(20).optional(), plain: z.string().max(300).optional() });

/** The discovery landscape for a topic (F-020). Fixed public endpoints only, like search. */
export async function POST(request: Request) {
  const supabase = await serverSupabase();
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Give a topic of at least 2 characters." }, { status: 400 });
  const d = parsed.data;
  return NextResponse.json({ sections: await landscape(d.query, d.words, undefined, d.broader, cleanSelection(d.sources), d.plain || d.words) });
}
