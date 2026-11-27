import { NextResponse } from "next/server";
import { z } from "zod";
import { searchSources, SearchError } from "@/find/server";
import { serverSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const Body = z.object({
  provider: z.enum(["europepmc", "clinicaltrials"]),
  query: z.string().min(2).max(500),
  openAccessOnly: z.boolean().optional(),
  fromYear: z.number().int().min(1900).max(2100).optional(),
});

/**
 * Search named scientific and government databases (F-119). It only reaches
 * those fixed public endpoints, so it stays on without sign-in; with sign-in
 * configured, it needs a signed-in user like everything else.
 */
export async function POST(request: Request) {
  const supabase = await serverSupabase();
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Give a search of at least 2 characters." }, { status: 400 });
  const { provider, query, ...o } = parsed.data;
  try {
    return NextResponse.json({ results: await searchSources(provider, query, o) });
  } catch (e) {
    if (e instanceof SearchError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("Search failed", e);
    return NextResponse.json({ error: "The search failed." }, { status: 502 });
  }
}
