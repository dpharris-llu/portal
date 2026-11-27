import { Wordmark } from "./Wordmark";

/** The name, tagline and motto, as on the brand card. */
export function BrandHero() {
  return (
    <div className="brand-hero">
      <Wordmark size={44} tagline />
      <hr />
      <p className="motto">Create. Present. Engage.</p>
    </div>
  );
}
