"use client";
/** The four modules (spec 1A). The current one is marked for screen readers and by an underline, not color alone. */
import Link from "next/link";
import { usePathname } from "next/navigation";

export type ModuleKey = "research" | "build" | "present" | "engage";

export const MODULES: { key: ModuleKey; name: string; href: string; job: string }[] = [
  { key: "research", name: "Research", href: "/research", job: "Work out what is true and what to argue" },
  { key: "build", name: "Build", href: "/build", job: "Turn the argument into slides" },
  { key: "present", name: "Present", href: "/present", job: "Deliver it" },
  { key: "engage", name: "Engage", href: "/engage", job: "Involve the audience" },
];

export function moduleFor(path: string): ModuleKey | null {
  if (/^\/(research|documents|data|evidence)(\/|$)/.test(path)) return "research";
  if (/^\/decks\/[^/]+\/present/.test(path) || /^\/present(\/|$)/.test(path)) return "present";
  if (/^\/(engage|join|j)(\/|$)/.test(path) || /^\/decks\/[^/]+\/audience/.test(path)) return "engage";
  if (/^\/(build|new|import|decks)(\/|$)/.test(path)) return "build";
  return null;
}

export function ModuleNav() {
  const current = moduleFor(usePathname() ?? "/");
  return (
    <nav className="module-nav" aria-label="Modules">
      {MODULES.map((m) => (
        <Link key={m.key} href={m.href} aria-current={current === m.key ? "page" : undefined}>
          {m.name}
        </Link>
      ))}
    </nav>
  );
}
