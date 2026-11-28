import { NextResponse } from "next/server";
import { z } from "zod";
import { availableVersions, BibleError, bibleConfigured, lookUp } from "@/find/bible-server";
import { serverAccess } from "@/lib/serverAccess";

export const dynamic = "force-dynamic";

/** GET: whether Bible lookup is set up here, and which versions the account has. */
export async function GET() {
  if (!bibleConfigured()) return NextResponse.json({ available: false, versions: [] });
  try {
    return NextResponse.json({ available: true, versions: await availableVersions() });
  } catch (e) {
    return NextResponse.json({ available: false, versions: [], error: e instanceof BibleError ? e.message : "API.Bible couldn't be reached." });
  }
}

const Body = z.object({ reference: z.string().min(2).max(80), version: z.enum(["NIV", "NKJV", "NLT", "KJV"]) });

/** POST a reference and version: the passage text, its reference and copyright (F-123). */
export async function POST(request: Request) {
  const access = await serverAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Give a reference and a version." }, { status: 400 });
  try {
    return NextResponse.json({ passage: await lookUp(parsed.data.reference, parsed.data.version) });
  } catch (e) {
    const err = e instanceof BibleError ? e : new BibleError("The passage couldn't be fetched.");
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
}
