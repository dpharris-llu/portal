"use client";
/** The old "New deck" page: purpose and outline now live in Research (spec 3), so this forwards there. */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NewDeck() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/curate");
  }, [router]);
  return <main className="narrow muted">Opening Research…</main>;
}
