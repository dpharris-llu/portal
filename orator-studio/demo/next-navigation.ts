/** Stand-in for "next/navigation" in the demo build. */
import { currentPath, navigate, useRouteParams } from "./router";

export function useRouter() {
  return {
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href, true),
    back: () => navigate("/"),
    refresh: () => {},
    prefetch: () => {},
  };
}

export function useParams<T extends Record<string, string>>(): T {
  return useRouteParams() as T;
}

export function usePathname(): string {
  return currentPath();
}
