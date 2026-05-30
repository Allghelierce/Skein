import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skein — Swarm Defense Command Center",
  description:
    "Self-healing drone-swarm mesh that detects jamming/cyber attacks with classic ML and reroutes around the damage in real time.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
