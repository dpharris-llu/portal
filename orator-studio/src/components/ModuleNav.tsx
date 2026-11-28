"use client";
/**
 * The modules (spec 1A) as the app's main navigation (spec 3C): a sidebar on
 * desktop, an icon rail on iPad, a bottom tab bar on phones. The current one is
 * marked for screen readers (aria-current) and by more than color.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { Wordmark } from "./Wordmark";

export type ModuleKey = "research" | "build" | "present" | "engage";

export const MODULES: { key: ModuleKey; name: string; href: string; job: string }[] = [
  { key: "research", name: "Curate", href: "/curate", job: "Discover what is known and hone your message" },
  { key: "build", name: "Build", href: "/build", job: "Turn the outline into slides" },
  { key: "present", name: "Present", href: "/present", job: "Deliver it" },
  { key: "engage", name: "Engage", href: "/engage", job: "Involve the audience" },
];

export function moduleFor(path: string): ModuleKey | null {
  if (/^\/(research|curate|documents|data|evidence)(\/|$)/.test(path)) return "research";
  if (/^\/decks\/[^/]+\/present/.test(path) || /^\/present(\/|$)/.test(path)) return "present";
  if (/^\/(engage|join|j)(\/|$)/.test(path) || /^\/decks\/[^/]+\/audience/.test(path)) return "engage";
  if (/^\/(build|new|import|decks)(\/|$)/.test(path)) return "build";
  return null;
}

export function ModuleNav({ compact = false }: { compact?: boolean }) {
  const path = usePathname() ?? "/";
  const current = path === "/" ? "home" : moduleFor(path);
  const items = [{ key: "home", name: "Home", href: "/" }, ...MODULES];
  return (
    <nav className={compact ? "side-nav compact" : "side-nav"} aria-label="Modules">
      <Link href="/" className="side-brand" aria-label="OratorStudio home">
        <span className="brand-full"><Wordmark size={20} /></span>
        <span className="brand-mono" aria-hidden="true">O<span>S</span></span>
      </Link>
      {items.map((m) => (
        <Link key={m.key} href={m.href} className="side-link" aria-current={current === m.key ? "page" : undefined}>
          <Icon name={m.key} size={22} />
          <span>{m.name}</span>
        </Link>
      ))}
    </nav>
  );
}
