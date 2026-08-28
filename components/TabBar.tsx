"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function IconList() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="0.5" /><circle cx="4.5" cy="12" r="0.5" /><circle cx="4.5" cy="18" r="0.5" />
    </svg>
  );
}
function IconSparkles() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 4l1.8 4.2L18 10l-4.2 1.8L12 16l-1.8-4.2L6 10l4.2-1.8L12 4z" /><path d="M18.5 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
    </svg>
  );
}

const TABS = [
  { href: "/", Icon: IconList, label: "현황" },
  { href: "/recommend", Icon: IconSparkles, label: "추천" },
  { href: "/stats", Icon: IconChart, label: "통계" },
];

export default function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar">
      {TABS.map(({ href, Icon, label }) => (
        <Link key={href} href={href} className={`tab ${pathname === href ? "active" : ""}`}>
          <Icon />
          <span className="tab-label">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
