import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactNode } from "react";

type NavItem = {
  href: string;
  label: string;
  activePaths: string[];
  icon: ReactNode;
};

const ICON_CLASS_NAME = "h-5 w-5";

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "입력",
    activePaths: ["/"],
    icon: (
      <svg aria-hidden="true" className={ICON_CLASS_NAME} fill="none" viewBox="0 0 24 24">
        <path
          d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    )
  },
  {
    href: "/ledger",
    label: "달력",
    activePaths: ["/ledger"],
    icon: (
      <svg aria-hidden="true" className={ICON_CLASS_NAME} fill="none" viewBox="0 0 24 24">
        <path
          d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    )
  },
  {
    href: "/transactions",
    label: "거래",
    activePaths: ["/transactions"],
    icon: (
      <svg aria-hidden="true" className={ICON_CLASS_NAME} fill="none" viewBox="0 0 24 24">
        <path
          d="M7 7h14l-3-3m3 3-3 3M17 17H3l3 3m-3-3 3-3"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    )
  },
  {
    href: "/stats",
    label: "통계",
    activePaths: ["/stats", "/categories", "/totals"],
    icon: (
      <svg aria-hidden="true" className={ICON_CLASS_NAME} fill="none" viewBox="0 0 24 24">
        <path
          d="M5 20V10m7 10V4m7 16v-7"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    )
  }
];

export default function BottomNav() {
  const router = useRouter();

  return (
    <nav
      aria-label="주요 메뉴"
      className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-blue-100 bg-white/95 shadow-[0_-8px_24px_rgba(30,64,175,0.08)] backdrop-blur sm:inset-x-auto sm:bottom-4 sm:left-1/2 sm:w-[calc(100%-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:overflow-hidden sm:rounded-2xl sm:border"
    >
      <div className="mx-auto grid max-w-lg grid-cols-4 px-2 pt-1.5">
        {NAV_ITEMS.map((item) => {
          const isActive = item.activePaths.includes(router.pathname);

          return (
            <Link
              key={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 ${
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-500 hover:bg-blue-50/70 hover:text-blue-700"
              }`}
              href={item.href}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
