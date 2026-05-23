import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { getTransactions } from "@/services/api";
import type { Transaction } from "@/types/transaction";
import { currentMonthKey, isMonthKey, shiftMonthKey } from "@/utils/month";

const currency = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0
});

const DailyStatsChart = dynamic(() => import("@/components/DailyStatsChart"), {
  ssr: false,
  loading: () => <div className="h-full rounded-md bg-zinc-950/60" />
});

export default function StatsPage() {
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
    if (!router.isReady || !isMonthKey(router.query.month)) {
      return;
    }

    setMonth(router.query.month);
  }, [router.isReady, router.query.month]);

  const dailyStats = useMemo(() => {
    const [year, monthNumber] = month.split("-").map(Number);
    const lastDay = new Date(year, monthNumber, 0).getDate();
    const totalsByDate = transactions
      .filter((transaction) => transaction.date.startsWith(month))
      .reduce<Record<string, { income: number; expense: number }>>((totals, transaction) => {
        totals[transaction.date] = totals[transaction.date] || { income: 0, expense: 0 };
        totals[transaction.date][transaction.type] += transaction.amount;
        return totals;
      }, {});

    return Array.from({ length: lastDay }, (_, index) => {
      const day = index + 1;
      const date = `${month}-${String(day).padStart(2, "0")}`;
      const dayTotals = totalsByDate[date] || { income: 0, expense: 0 };

      return {
        day: `${day}일`,
        income: dayTotals.income,
        expense: dayTotals.expense,
        balance: dayTotals.income - dayTotals.expense
      };
    });
  }, [month, transactions]);

  const totals = useMemo(() => {
    const income = dailyStats.reduce((sum, day) => sum + day.income, 0);
    const expense = dailyStats.reduce((sum, day) => sum + day.expense, 0);
    return { income, expense, balance: income - expense };
  }, [dailyStats]);

  const shiftMonth = (delta: number) => {
    const nextMonth = shiftMonthKey(month, delta);
    setMonth(nextMonth);
    router.replace({ pathname: router.pathname, query: { ...router.query, month: nextMonth } }, undefined, {
      shallow: true
    });
  };

  return (
    <>
      <Head>
        <title>일별 통계 | 고태윤 가계부</title>
        <meta name="description" content="일별 수입 지출 그래프" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#3a0508,transparent_32%),linear-gradient(135deg,#070707,#191919_55%,#b5121b)] text-zinc-50">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-3 border-b border-red-500/40 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-red-300">
                고태윤 가계부
              </p>
              <h1 className="mt-1 text-4xl font-black tracking-normal text-white">
                일별 통계 그래프
              </h1>
            </div>
            <Link
              className="btn-secondary inline-flex h-10 items-center justify-center"
              href={{ pathname: "/", query: { month } }}
            >
              입력 화면으로
            </Link>
          </header>

          <section className="grid gap-3 md:grid-cols-3">
            <SummaryCard label="월 수입" value={totals.income} tone="income" />
            <SummaryCard label="월 지출" value={totals.expense} tone="expense" />
            <SummaryCard label="월 잔액" value={totals.balance} tone="primary" />
          </section>

          <section className="panel p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h2 className="text-lg font-black">일별 수입 / 지출</h2>
              <div className="flex items-center gap-2">
                <button className="btn-small" type="button" onClick={() => shiftMonth(-1)}>
                  이전
                </button>
                <strong className="min-w-28 text-center text-lg">{month}</strong>
                <button className="btn-small" type="button" onClick={() => shiftMonth(1)}>
                  다음
                </button>
              </div>
            </div>

            <div className="mt-6 h-[420px] w-full">
              <DailyStatsChart data={dailyStats} />
            </div>
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
  tone: "income" | "expense" | "primary";
  value: number;
}) {
  const toneClass = {
    income: "text-emerald-300",
    expense: "text-red-300",
    primary: "text-white"
  }[tone];

  return (
    <div className="panel p-4">
      <p className="text-sm font-bold text-zinc-400">{label}</p>
      <p className={`money mt-2 text-xl font-black sm:text-2xl ${toneClass}`}>
        {currency.format(value)}
      </p>
    </div>
  );
}
