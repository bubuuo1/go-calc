import Link from "next/link";
import { useRouter } from "next/router";

const STATS_ITEMS = [
  { href: "/stats", label: "일별" },
  { href: "/categories", label: "카테고리" },
  { href: "/totals", label: "연간" }
] as const;

export default function StatsSubnav() {
  const router = useRouter();

  return (
    <nav aria-label="통계 상세 메뉴" className="rounded-xl bg-blue-50 p-1">
      <div className="grid grid-cols-3 gap-1">
        {STATS_ITEMS.map((item) => {
          const isActive = router.pathname === item.href;

          return (
            <Link
              key={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-11 items-center justify-center rounded-lg px-2 text-sm font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 ${
                isActive
                  ? "bg-blue-700 text-white shadow-sm shadow-blue-900/20"
                  : "text-blue-700 hover:bg-white"
              }`}
              href={item.href}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
