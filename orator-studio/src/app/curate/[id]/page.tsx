import { redirect } from "next/navigation";

/** The earlier presentation workspace was retired for the knowledge model (spec section 5): its addresses open the Topic Library. */
export default function Retired() {
  redirect("/curate");
}
