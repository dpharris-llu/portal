import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LecternAI",
  description: "Presentations stored as arguments: claims, evidence and intent.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
