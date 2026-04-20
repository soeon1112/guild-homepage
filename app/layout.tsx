import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import ScrollRestorer from "./components/ScrollRestorer";
import { AuthProvider } from "./components/AuthProvider";
import GuildChat from "./components/GuildChat";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "새벽빛 - 마비노기 모바일 길드",
  description: "마비노기 모바일 길드 새벽빛 홈페이지",
  openGraph: {
    title: "새벽빛",
    description: "마비노기 모바일 길드 새벽빛 홈페이지",
    images: [{ url: "https://dawnlight-guild.vercel.app/images/guild-logo.png" }],
  },
};

function Header() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="site-header-title">
          새벽빛
        </Link>
        <span className="site-header-sub">마비노기 모바일 길드</span>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p>&copy; 2026 새벽빛 길드. All rights reserved.</p>
      </div>
    </footer>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${geistSans.variable} h-full antialiased`}>
      <body className="relative min-h-full flex flex-col">
        {/* Full-screen background — no overlay, no filter */}
        <div className="bg-scene" aria-hidden="true" />
        <AuthProvider>
          <ScrollRestorer />
          <Header />
          <main className="relative z-10 flex-1">{children}</main>
          <Footer />
          <GuildChat />
        </AuthProvider>
      </body>
    </html>
  );
}
