import type { Metadata, Viewport } from "next";
import "./globals.css";
import TabBar from "@/components/TabBar";
import PushBanner from "@/components/PushBanner";

export const metadata: Metadata = {
  title: "Lens Restock Status",
  description: "렌즈 품절·재입고 추적과 맞춤 추천",
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <div className="app">
          <PushBanner />
          {children}
        </div>
        <TabBar />
      </body>
    </html>
  );
}
