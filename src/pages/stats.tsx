import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { getTransactions } from "@/services/api";
import type { Transaction } from "@/types/transaction";
import { currentMonthKey, isMonthKey, shiftMonthKey } from "@/utils/month";
import { getStoredMonth, hasAppEntered, setStoredMonth } from "@/utils/session";
import { DEFAULT_CATEGORIES, EXCLUDED_GRAPH_CATEGORIES } from "@/utils/ledger";

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
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    DEFAULT_CATEGORIES.filter((category) => !EXCLUDED_GRAPH_CATEGORIES.includes(category))
  );

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

  const graphCategories = useMemo(() => {
    const transactionCategories = transactions.map((transaction) => transaction.category);
    return Array.from(new Set([...DEFAULT_CATEGORIES, ...transactionCategories]));
  }, [transactions]);

  const dailyStats = useMemo(() => {
    const [year, monthNumber] = month.split("-").map(Number);
    const lastDay = new Date(year, monthNumber, 0).getDate();
    const totalsByDate = transactions
      .filter(
        (transaction) =>
          transaction.date.startsWith(month) &&
          selectedCategories.includes(transaction.category)
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
  }, [month, selectedCategories, transactions]);

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
          selectedCategories.includes(transaction.category)
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
  }, [dailyStats, month, selectedCategories, totals.expense, transactions]);

  const shiftMonth = (delta: number) => {
    const nextMonth = shiftMonthKey(month, delta);
    setMonth(nextMonth);
    setStoredMonth(nextMonth);
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category]
    );
  };

  return (
    <>
      <Head>
        <title>일별 통계 | 솔샘네 가계부</title>
        <meta name="description" content="일별 지출 꺾은선 그래프" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="min-h-screen bg-slate-50 text-slate-950">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-3 border-b border-slate-200 pb-5">
            <div className="flex items-center justify-between gap-3">
              <div>
              <p className="flex items-center gap-2 text-lg font-black tracking-normal text-slate-900">
                <span className="flex -space-x-2">
                  <img alt="" className="h-8 w-8 rounded-full border-2 border-white object-cover shadow-sm" src="/images/2.png" />
                  <img alt="" className="h-8 w-8 rounded-full border-2 border-white object-cover shadow-sm" src="/images/3.png" />
                </span>
                <span>솔샘네 가계부</span>
              </p>
              </div>
              <IconNav href="/" label="가계부" type="home" />
            </div>
            <nav className="flex flex-wrap justify-center gap-2">
              <IconNav href="/totals" label="전체 통계" type="totals" />
              <IconNav href="/categories" label="카테고리" type="categories" />
            </nav>
          </header>

          <section className="order-1 panel flex justify-center p-3">
            <div className="flex items-center gap-2">
              <button className="btn-small" type="button" onClick={() => shiftMonth(-1)}>
                이전
              </button>
              <strong className="min-w-28 text-center text-lg font-black">{month}</strong>
              <button className="btn-small" type="button" onClick={() => shiftMonth(1)}>
                다음
              </button>
            </div>
          </section>

          <section className="order-3 grid gap-3 md:order-2 md:grid-cols-3">
            <SummaryCard label="월 수입" value={totals.income} tone="income" />
            <SummaryCard label="월 지출" value={totals.expense} tone="expense" />
            <SummaryCard label="월 잔액" value={totals.balance} tone="primary" />
          </section>

          <section className="order-4 grid gap-3 md:order-3 md:grid-cols-3">
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

          <section className="order-2 panel p-4 md:order-4">
            <h2 className="text-center text-lg font-black md:text-left">일별 지출 추이</h2>

            <div className="mt-4 h-64 w-full sm:h-80 lg:h-[420px]">
              <DailyStatsChart data={dailyStats} />
            </div>
          </section>

          <section className="order-5 panel p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-black">그래프 포함 카테고리</h2>
              <span className="text-xs font-bold text-slate-500">
                기본 제외: 적금, 대출, 경조사, 보험
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {graphCategories.map((category) => (
                <label
                  key={category}
                  className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700"
                >
                  <input
                    checked={selectedCategories.includes(category)}
                    className="h-4 w-4 accent-slate-600"
                    type="checkbox"
                    onChange={() => toggleCategory(category)}
                  />
                  <span className="truncate">{category}</span>
                </label>
              ))}
            </div>
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
  type: "home" | "totals" | "categories";
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
      {type === "categories" ? (
        <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M4 6h16" />
          <path d="M4 12h10" />
          <path d="M4 18h7" />
        </svg>
      ) : null}
      <span className="whitespace-nowrap text-[8px] font-black leading-none">{label}</span>
    </Link>
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
