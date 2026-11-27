"use client";
/**
 * Image storage for imported and uploaded files. Blocks refer to images as
 * `asset:<id>`; the bytes live in IndexedDB, which holds far more than
 * localStorage and is shared with the audience window (same origin).
 * Cloud sync of assets (Supabase Storage) is not built yet.
 */
import { useEffect, useState } from "react";

const DB = "lectern-assets";
const STORE = "assets";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function putAsset(id: string, blob: Blob): Promise<void> {
  const db = await open();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

export async function getAsset(id: string): Promise<Blob | null> {
  const db = await open();
  const blob = await new Promise<Blob | null>((res, rej) => {
    const req = db.transaction(STORE).objectStore(STORE).get(id);
    req.onsuccess = () => res((req.result as Blob | undefined) ?? null);
    req.onerror = () => rej(req.error);
  });
  db.close();
  return blob;
}

const cache = new Map<string, string>();

/** Resolve a block's image src to something an <img> can show. */
export function useAssetUrl(src: string): { url: string | null; missing: boolean } {
  const isAsset = src.startsWith("asset:");
  const [url, setUrl] = useState<string | null>(isAsset ? cache.get(src) ?? null : src || null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!isAsset) {
      setUrl(src || null);
      return;
    }
    if (cache.has(src)) {
      setUrl(cache.get(src)!);
      return;
    }
    let live = true;
    getAsset(src.slice(6))
      .then((blob) => {
        if (!live) return;
        if (!blob) return setMissing(true);
        const u = URL.createObjectURL(blob);
        cache.set(src, u);
        setUrl(u);
      })
      .catch(() => live && setMissing(true));
    return () => {
      live = false;
    };
  }, [src, isAsset]);
  return { url, missing };
}
