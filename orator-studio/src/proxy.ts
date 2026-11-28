import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfig } from "@/lib/supabase/config";

/** Refreshes the Supabase session and requires login when Supabase is configured. */
export async function proxy(request: NextRequest) {
  const cfg = supabaseConfig();
  if (!cfg) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  // Audience members join from phones without an account (A-01).
  const isPublic =
    path.startsWith("/login") || path.startsWith("/auth") || path === "/join" || path.startsWith("/j/") || path.startsWith("/api/live/join/");
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // The audience window and static assets stay reachable without a session,
  // as does the open word-study data (STEPBible, CC BY), served as static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|wordstudy/|decks/[^/]+/audience).*)"],
};
