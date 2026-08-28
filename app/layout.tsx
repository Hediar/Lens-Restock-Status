import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lens Restock Status",
  description: "콘택트렌즈 재고·재입고 현황 트래커",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
