import { NextResponse } from "next/server";
import { z } from "zod";
import { landscape } from "@/find/server";
import { serverSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ query: z.string().min(2).max(800), words: z.string().min(2).max(300), broader: z.string().max(800).optional() });

/** The discovery landscape for a topic (F-020). Fixed public endpoints only, like search. */
export async function POST(request: Request) {
  const supabase = await serverSupabase();
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Give a topic of at least 2 characters." }, { status: 400 });
  return NextResponse.json({ sections: await landscape(parsed.data.query, parsed.data.words, undefined, parsed.data.broader) });
}
