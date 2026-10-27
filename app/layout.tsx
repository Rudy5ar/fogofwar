import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spoiler-free",
  description: "LoL esports schedules and standings as of the day you're watching.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
