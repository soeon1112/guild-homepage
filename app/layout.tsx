import type { Metadata, Viewport } from "next";
import { Geist, Noto_Sans_KR, Noto_Serif_KR } from "next/font/google";
import ScrollRestorer from "./components/ScrollRestorer";
import { AuthProvider } from "./components/AuthProvider";
import FloatingChat from "./components/redesign/FloatingChat";
import FloatingPet from "./components/redesign/FloatingPet";
import { ChromeShell } from "./components/redesign/ChromeShell";
import BadgeToast from "./components/BadgeToast";
import KeyboardScrollGuard from "./components/KeyboardScrollGuard";
import { VisualViewportSync } from "./components/VisualViewportSync";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Dawnlight 2 (하늘섬 redesign) typography. Loaded globally so the font
// files are warmed in the browser cache, but only consumed inside the
// `.dawnlight2` scope (see globals.css). Outside that scope the legacy
// cosmic UI keeps using Geist + the @import'd Noto Serif KR — these
// next/font instances coexist via separate CSS variables.
const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  display: "swap",
});

const notoSerifKr = Noto_Serif_KR({
  variable: "--font-noto-serif",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://dawnlight-guild.vercel.app"),
  title: "새벽빛 - 마비노기 모바일 길드",
  description: "마비노기 모바일 길드 새벽빛 홈페이지",
  openGraph: {
    title: "새벽빛",
    description: "마비노기 모바일 길드 새벽빛 홈페이지",
    type: "website",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: "새벽빛",
    description: "마비노기 모바일 길드 새벽빛 홈페이지",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${notoSansKr.variable} ${notoSerifKr.variable} h-full antialiased`}
    >
      <body className="relative min-h-full flex flex-col">
        <AuthProvider>
          <ScrollRestorer />
          <KeyboardScrollGuard />
          <VisualViewportSync />
          <ChromeShell>{children}</ChromeShell>
          <FloatingChat />
          <FloatingPet />
          <BadgeToast />
        </AuthProvider>
      </body>
    </html>
  );
}
