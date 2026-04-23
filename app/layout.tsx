import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import ScrollRestorer from "./components/ScrollRestorer";
import { AuthProvider } from "./components/AuthProvider";
import FloatingChat from "./components/redesign/FloatingChat";
import { ChromeShell } from "./components/redesign/ChromeShell";
import BadgeToast from "./components/BadgeToast";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "새벽빛 - 마비노기 모바일 길드",
  description: "마비노기 모바일 길드 새벽빛 홈페이지",
  openGraph: {
    title: "새벽빛",
    description: "마비노기 모바일 길드 새벽빛 홈페이지",
    images: [{ url: "https://dawnlight-guild.vercel.app/images/guild-logo.png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${geistSans.variable} h-full antialiased`}>
      <body className="relative min-h-full flex flex-col">
        <AuthProvider>
          <ScrollRestorer />
          <ChromeShell>{children}</ChromeShell>
          <FloatingChat />
          <BadgeToast />
        </AuthProvider>
      </body>
    </html>
  );
}
