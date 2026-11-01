import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Semi_Condensed } from "next/font/google";
import "./globals.css";

const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-ui" });
const condensed = Barlow_Semi_Condensed({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "Fog of War · spoiler-free LoL esports",
  description: "LoL esports schedules and standings as of the day you're watching.",
  appleWebApp: { capable: true, title: "Fog of War", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#0a0e1a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${barlow.variable} ${condensed.variable}`}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
