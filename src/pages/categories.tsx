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
        <title>카테고리 분석 | 고태윤 가계부</title>
        <meta name="description" content="카테고리별 지출 분석" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="min-h-screen bg-slate-50 text-slate-950">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4 sm:px-5 lg:px-6">
          <header className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                고태윤 가계부
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-normal text-slate-950">
                카테고리별 지출
              </h1>
            </div>
            <div className="flex gap-2">
              <Link
                className="btn-secondary inline-flex h-9 items-center justify-center"
                href="/"
                replace
              >
                가계부
              </Link>
              <Link
                className="btn-secondary inline-flex h-9 items-center justify-center"
                href="/stats"
                replace
              >
                일별 그래프
              </Link>
            </div>
          </header>

          <section className="grid gap-3 md:grid-cols-3">
            <SummaryCard label={`${month} 총 지출`} value={totalExpense} tone="expense" />
            <SummaryCard
              label="가장 큰 카테고리"
              value={categoryStats[0]?.amount || 0}
              tone="primary"
            />
            <div className="panel flex items-center justify-between gap-2 p-3">
              <button className="btn-small" type="button" onClick={() => shiftMonth(-1)}>
                이전
              </button>
              <strong className="text-base">{month}</strong>
              <button className="btn-small" type="button" onClick={() => shiftMonth(1)}>
                다음
              </button>
            </div>
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

function SummaryCard({
  label,
  tone,
  value
}: {
  label: string;
  tone: "expense" | "primary";
  value: number;
}) {
  const toneClass = {
    expense: "text-red-600",
    primary: "text-slate-950"
  }[tone];

  return (
    <div className="panel p-3">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className={`money mt-1 text-lg font-black sm:text-xl ${toneClass}`}>
        {currency.format(value)}
      </p>
    </div>
  );
}
