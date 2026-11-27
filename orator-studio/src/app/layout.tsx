import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OratorStudio",
  description: "Ideas first. Slides follow. Create, present and engage.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
