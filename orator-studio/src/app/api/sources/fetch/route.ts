import { NextResponse } from "next/server";
import { fetchSource, FetchRefused } from "@/sources/fetch-server";
import { serverAccess } from "@/lib/serverAccess";

export const dynamic = "force-dynamic";

/** Fetch a data URL for a source. The response comes back to the page for mapping; nothing is sent to Claude here. */
export async function POST(request: Request) {
  const access = await serverAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const body = await request.json().catch(() => null);
  if (typeof body?.url !== "string" || body.url.length > 4000) return NextResponse.json({ error: "Give a URL." }, { status: 400 });
  try {
    return NextResponse.json(await fetchSource(body.url));
  } catch (e) {
    if (e instanceof FetchRefused) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("Source fetch failed", e);
    return NextResponse.json({ error: "The URL couldn't be fetched." }, { status: 502 });
  }
}
