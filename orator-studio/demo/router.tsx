/**
 * A tiny in-memory router standing in for Next.js routing in the demo build.
 * The demo runs as one HTML page, so routes are React state, not URLs.
 */
import { createContext, useContext, useEffect, useState } from "react";

type Listener = (path: string) => void;
let current = "/";
const listeners = new Set<Listener>();

export function navigate(path: string, replace = false) {
  void replace;
  current = path;
  for (const l of listeners) l(path);
  window.scrollTo(0, 0);
}

export function usePath(initial: string): string {
  const [path, setPath] = useState(() => {
    current = initial;
    return initial;
  });
  useEffect(() => {
    listeners.add(setPath);
    return () => {
      listeners.delete(setPath);
    };
  }, []);
  return path;
}

export const ParamsContext = createContext<Record<string, string>>({});
export const useRouteParams = () => useContext(ParamsContext);
export const currentPath = () => current;
