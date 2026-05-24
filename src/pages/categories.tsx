import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { getTransactions } from "@/services/api";
import type { Transaction } from "@/types/transaction";
import { currentMonthKey, isMonthKey, shiftMonthKey } from "@/utils/month";
import { getStoredMonth, hasAppEntered, setStoredMonth } from "@/utils/session";

const currency = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0
});

export default function CategoriesPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [month, setMonth] = useState(currentMonthKey());

  useEffect(() => {
    const load = async () => {
      try {
        setTransactions(await getTransactions());
      } catch {
        setTransactions([]);
      }
    };

    load();
  }, []);

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    if (!hasAppEntered()) {
      router.replace("/");
      return;
    }

    const queryMonth = router.query.month;
    const nextMonth = isMonthKey(queryMonth) ? queryMonth : getStoredMonth();
    setMonth(nextMonth);
    setStoredMonth(nextMonth);

    if (isMonthKey(queryMonth)) {
      router.replace(router.pathname, undefined, { shallow: true });
    }
  }, [router.isReady, router.query.month]);

  const categoryStats = useMemo(() => {
    const totals = transactions
      .filter(
        (transaction) =>
          transaction.type === "expense" && transaction.date.startsWith(month)
      )
      .reduce<Record<string, number>>((result, transaction) => {
        result[transaction.category] = (result[transaction.category] || 0) + transaction.amount;
        return result;
      }, {});

    return Object.entries(totals)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [month, transactions]);

  const totalExpense = categoryStats.reduce((sum, item) => sum + item.amount, 0);
  const maxAmount = Math.max(...categoryStats.map((item) => item.amount), 1);

  const shiftMonth = (delta: number) => {
    const nextMonth = shiftMonthKey(month, delta);
    setMonth(nextMonth);
    setStoredMonth(nextMonth);
  };

  return (
    <>
      <Head>
        <title>카테고리 분석 | 솔샘네 가계부</title>
        <meta name="description" content="카테고리별 지출 분석" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="min-h-screen bg-slate-50 text-slate-950">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4 sm:px-5 lg:px-6">
          <header className="flex flex-col gap-3 border-b border-slate-200 pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
              <p className="flex items-center gap-2 text-lg font-black tracking-normal text-slate-900">
                <span className="flex -space-x-2">
                  <img alt="" className="h-11 w-11 rounded-full border-2 border-white object-cover shadow-sm sm:h-9 sm:w-9" src="/images/header-2.png" />
                  <img alt="" className="h-11 w-11 rounded-full border-2 border-white object-cover shadow-sm sm:h-9 sm:w-9" src="/images/header-3.png" />
                </span>
                <span>솔샘네 가계부</span>
              </p>
              </div>
              <IconNav href="/" label="가계부" type="home" />
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <IconNav href="/totals" label="전체 통계" type="totals" />
              <IconNav href="/stats" label="일별 그래프" type="stats" />
            </div>
          </header>

          <section className="panel flex justify-center p-3">
            <div className="flex items-center gap-2">
              <button className="btn-small" type="button" onClick={() => shiftMonth(-1)}>
                이전
              </button>
              <strong className="min-w-28 text-center text-base font-black">{month}</strong>
              <button className="btn-small" type="button" onClick={() => shiftMonth(1)}>
                다음
              </button>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-3">
            <SummaryCard label={`${month} 총 지출`} value={totalExpense} tone="expense" />
            <SummaryCard
              label="가장 큰 카테고리"
              value={categoryStats[0]?.amount || 0}
              tone="primary"
            />
            <SummaryCard
              label="카테고리 수"
              value={categoryStats.length}
              tone="primary"
              valueType="count"
            />
          </section>

          <section className="panel p-3">
            {categoryStats.length === 0 ? (
              <p className="p-5 text-center text-sm text-slate-500">
                표시할 지출 데이터가 없습니다.
              </p>
            ) : (
              <div className="grid gap-3">
                {categoryStats.map((item) => (
                  <div key={item.category}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-black text-slate-950">{item.category}</span>
                      <span className="money ml-3 shrink-0 font-black text-red-600">
                        {currency.format(item.amount)}
                      </span>
                    </div>
                    <div className="h-3 rounded-full bg-slate-50">
                      <div
                        className="h-3 rounded-full bg-red-500"
                        style={{ width: `${(item.amount / maxAmount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}

function IconNav({
  href,
  label,
  type
}: {
  href: string;
  label: string;
  type: "home" | "totals" | "stats";
}) {
  return (
    <Link
      aria-label={label}
      className="flex h-12 w-16 flex-col items-center justify-center gap-0.5 rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-400 hover:text-slate-950"
      href={href}
      replace
      title={label}
    >
      {type === "home" ? (
        <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M3 11l9-8 9 8" />
          <path d="M5 10v10h14V10" />
          <path d="M9 20v-6h6v6" />
        </svg>
      ) : null}
      {type === "totals" ? (
        <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M4 19V5" />
          <path d="M4 19h16" />
          <path d="M8 16v-5" />
          <path d="M12 16V8" />
          <path d="M16 16v-3" />
        </svg>
      ) : null}
      {type === "stats" ? (
        <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M4 19h16" />
          <path d="M4 15l4-4 4 3 5-7 3 4" />
        </svg>
      ) : null}
      <span className="whitespace-nowrap text-[8px] font-black leading-none">{label}</span>
    </Link>
  );
}

function SummaryCard({
  label,
  tone,
  value,
  valueType = "currency"
}: {
  label: string;
  tone: "expense" | "primary";
  value: number;
  valueType?: "currency" | "count";
}) {
  const toneClass = {
    expense: "text-red-600",
    primary: "text-slate-950"
  }[tone];

  return (
    <div className="panel p-3">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className={`money mt-1 text-lg font-black sm:text-xl ${toneClass}`}>
        {valueType === "count" ? `${value}개` : currency.format(value)}
      </p>
    </div>
  );
}
