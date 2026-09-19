import type { Metadata } from "next";
import { IBM_Plex_Mono, Outfit } from "next/font/google";
import { GurdyBuddy } from "@/app/ui/gurdy-buddy";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Gurdy ledger",
  description: "Per-device signed ledger, verified on ingest",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${outfit.variable} ${mono.variable}`}>
      <body className={outfit.className}>
        {children}
        <GurdyBuddy />
      </body>
    </html>
  );
}
