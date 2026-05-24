import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { getTransactions } from "@/services/api";
import type { Transaction } from "@/types/transaction";
import { currentMonthKey, isMonthKey, shiftMonthKey } from "@/utils/month";
import { getStoredMonth, hasAppEntered, setStoredMonth } from "@/utils/session";
import { EXCLUDED_GRAPH_CATEGORIES } from "@/utils/ledger";

const currency = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0
});

const DailyStatsChart = dynamic(() => import("@/components/DailyStatsChart"), {
  ssr: false,
  loading: () => <div className="h-full rounded-md bg-slate-50" />
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

  const dailyStats = useMemo(() => {
    const [year, monthNumber] = month.split("-").map(Number);
    const lastDay = new Date(year, monthNumber, 0).getDate();
    const totalsByDate = transactions
      .filter(
        (transaction) =>
          transaction.date.startsWith(month) &&
          !EXCLUDED_GRAPH_CATEGORIES.includes(transaction.category)
      )
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

  const expenseInsights = useMemo(() => {
    const topExpenseDay = dailyStats.reduce(
      (topDay, day) => (day.expense > topDay.expense ? day : topDay),
      { day: "-", income: 0, expense: 0, balance: 0 }
    );
    const averageDailyExpense = dailyStats.length
      ? Math.round(totals.expense / dailyStats.length)
      : 0;
    const previousMonth = shiftMonthKey(month, -1);
    const previousExpense = transactions
      .filter(
        (transaction) =>
          transaction.type === "expense" &&
          transaction.date.startsWith(previousMonth) &&
          !EXCLUDED_GRAPH_CATEGORIES.includes(transaction.category)
      )
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const difference = totals.expense - previousExpense;
    const comparison =
      previousExpense === 0
        ? totals.expense > 0
          ? "전월 지출 없음"
          : "변화 없음"
        : difference === 0
        ? "전월과 동일"
        : `${currency.format(Math.abs(difference))} ${difference > 0 ? "증가" : "감소"}`;

    return {
      topDay: topExpenseDay.expense > 0 ? topExpenseDay.day : "지출 없음",
      topDayAmount: topExpenseDay.expense,
      averageDailyExpense,
      comparison,
      previousExpense
    };
  }, [dailyStats, month, totals.expense, transactions]);

  const shiftMonth = (delta: number) => {
    const nextMonth = shiftMonthKey(month, delta);
    setMonth(nextMonth);
    setStoredMonth(nextMonth);
  };

  return (
    <>
      <Head>
        <title>일별 통계 | 고태윤 가계부</title>
        <meta name="description" content="일별 지출 꺾은선 그래프" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="min-h-screen bg-slate-50 text-slate-950">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                고태윤 가계부
              </p>
              <h1 className="mt-1 text-4xl font-black tracking-normal text-slate-950">
                일별 통계 그래프
              </h1>
            </div>
            <Link
              className="btn-secondary inline-flex h-10 items-center justify-center"
              href="/"
              replace
            >
              가계부
            </Link>
          </header>

          <section className="grid gap-3 md:grid-cols-3">
            <SummaryCard label="월 수입" value={totals.income} tone="income" />
            <SummaryCard label="월 지출" value={totals.expense} tone="expense" />
            <SummaryCard label="월 잔액" value={totals.balance} tone="primary" />
          </section>

          <section className="grid gap-3 md:grid-cols-3">
            <InsightCard
              detail={
                expenseInsights.topDayAmount > 0
                  ? currency.format(expenseInsights.topDayAmount)
                  : "이번 달 지출 데이터가 없습니다."
              }
              label="가장 많이 쓴 날"
              value={expenseInsights.topDay}
            />
            <InsightCard
              detail="월 지출을 해당 월 전체 일수로 나눴습니다."
              label="평균 일 지출"
              value={currency.format(expenseInsights.averageDailyExpense)}
            />
            <InsightCard
              detail={`전월 지출 ${currency.format(expenseInsights.previousExpense)}`}
              label="전월 대비"
              value={expenseInsights.comparison}
            />
          </section>

          <section className="panel p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h2 className="text-lg font-black">일별 지출 추이</h2>
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

            <div className="mt-4 h-64 w-full sm:h-80 lg:h-[420px]">
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
    income: "text-slate-600",
    expense: "text-red-600",
    primary: "text-slate-950"
  }[tone];

  return (
    <div className="panel p-4">
      <p className="text-sm font-bold text-slate-500">{label}</p>
      <p className={`money mt-2 text-xl font-black sm:text-2xl ${toneClass}`}>
        {currency.format(value)}
      </p>
    </div>
  );
}

function InsightCard({
  detail,
  label,
  value
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <div className="panel p-4">
      <p className="text-sm font-bold text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-black text-slate-950 sm:text-xl">{value}</p>
      <p className="mt-1 text-xs font-bold text-slate-500">{detail}</p>
    </div>
  );
}
