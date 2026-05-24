import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { getTransactions } from "@/services/api";
import type { Transaction } from "@/types/transaction";
import { currentMonthKey, isMonthKey } from "@/utils/month";
import { getStoredMonth, hasAppEntered, setStoredMonth } from "@/utils/session";

const currency = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0
});

type TotalRow = {
  key: string;
  income: number;
  expense: number;
  balance: number;
};

export default function TotalsPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey());

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
    setSelectedMonth(nextMonth);
    setSelectedYear(nextMonth.slice(0, 4));
    setStoredMonth(nextMonth);

    if (isMonthKey(queryMonth)) {
      router.replace(router.pathname, undefined, { shallow: true });
    }
  }, [router.isReady, router.query.month]);

  const yearTransactions = useMemo(
    () => transactions.filter((transaction) => transaction.date.startsWith(selectedYear)),
    [selectedYear, transactions]
  );

  const yearlyTotal = useMemo(() => buildTotals(yearTransactions), [yearTransactions]);
  const monthlyRows = useMemo(() => groupTotals(yearTransactions, 7), [yearTransactions]);

  const shiftYear = (delta: number) => {
    setSelectedYear((year) => {
      const nextYear = String(Number(year) + delta);
      const nextMonth = `${nextYear}-${selectedMonth.slice(5, 7)}`;
      setSelectedMonth(nextMonth);
      setStoredMonth(nextMonth);
      return nextYear;
    });
  };

  return (
    <>
      <Head>
        <title>전체 통계 | 솔샘네 가계부</title>
        <meta name="description" content="월별 연도별 수입 지출 잔액 통계" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="min-h-screen bg-slate-50 text-slate-950">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-3 border-b border-slate-200 pb-4">
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
            <nav className="flex flex-wrap justify-center gap-2">
              <IconNav href="/stats" label="일별 그래프" type="stats" />
              <IconNav href="/categories" label="카테고리" type="categories" />
            </nav>
          </header>

          <section className="panel flex flex-col items-center gap-3 p-4 text-center sm:flex-row sm:justify-between sm:text-left">
            <h2 className="text-lg font-black">연도 선택</h2>
            <div className="flex items-center gap-2">
              <button className="btn-small" type="button" onClick={() => shiftYear(-1)}>
                이전
              </button>
              <strong className="min-w-28 rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-center text-base font-black text-slate-900">
                {selectedYear}년
              </strong>
              <button className="btn-small" type="button" onClick={() => shiftYear(1)}>
                다음
              </button>
            </div>
          </section>

          <section className="order-3 grid gap-3 md:order-2 md:grid-cols-3">
            <SummaryCard label={`${selectedYear}년 총 수입`} value={yearlyTotal.income} tone="income" />
            <SummaryCard label={`${selectedYear}년 총 지출`} value={yearlyTotal.expense} tone="expense" />
            <SummaryCard label={`${selectedYear}년 잔액`} value={yearlyTotal.balance} tone="primary" />
          </section>

          <section className="order-2 md:order-3">
            <TotalTable
              title={`${selectedYear}년 월별 수입 / 지출 / 잔액`}
              rows={monthlyRows}
              emptyText="선택한 연도의 월별 데이터가 없습니다."
            />
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
  type: "home" | "stats" | "categories";
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
      {type === "stats" ? (
        <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M4 19h16" />
          <path d="M4 15l4-4 4 3 5-7 3 4" />
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

function TotalTable({
  title,
  rows,
  emptyText
}: {
  title: string;
  rows: TotalRow[];
  emptyText: string;
}) {
  return (
    <section className="panel p-4">
      <h2 className="text-lg font-black">{title}</h2>
      <div className="mt-4 grid gap-2 md:hidden">
        {rows.length === 0 ? (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">
            {emptyText}
          </p>
        ) : (
          rows.map((row) => (
            <article
              key={row.key}
              className="rounded-md border border-slate-200 bg-white p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <strong className="text-sm text-slate-950">{row.key}</strong>
                <span className="money text-sm font-black text-slate-950">
                  {currency.format(row.balance)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded bg-slate-50 p-2">
                  <p className="text-slate-500">수입</p>
                  <p className="money mt-1 font-black text-slate-600">
                    {currency.format(row.income)}
                  </p>
                </div>
                <div className="rounded bg-slate-50 p-2">
                  <p className="text-slate-500">지출</p>
                  <p className="money mt-1 font-black text-red-600">
                    {currency.format(row.expense)}
                  </p>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
      <div className="mt-4 hidden overflow-hidden rounded-md border border-slate-200 md:block">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">기간</th>
              <th className="px-3 py-2 text-right">수입</th>
              <th className="px-3 py-2 text-right">지출</th>
              <th className="px-3 py-2 text-right">잔액</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-slate-500" colSpan={4}>
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.key} className="border-t border-slate-100 bg-white">
                  <td className="px-3 py-2 font-black text-slate-950">{row.key}</td>
                  <td className="money px-3 py-2 font-bold text-slate-600">
                    {currency.format(row.income)}
                  </td>
                  <td className="money px-3 py-2 font-bold text-red-600">
                    {currency.format(row.expense)}
                  </td>
                  <td className="money px-3 py-2 font-black text-slate-950">
                    {currency.format(row.balance)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function buildTotals(transactions: Transaction[]) {
  const income = transactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const expense = transactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  return { income, expense, balance: income - expense };
}

function groupTotals(transactions: Transaction[], keyLength: number): TotalRow[] {
  const grouped = transactions.reduce<Record<string, Transaction[]>>((totals, transaction) => {
    const key = transaction.date.slice(0, keyLength);
    totals[key] = totals[key] || [];
    totals[key].push(transaction);
    return totals;
  }, {});

  return Object.entries(grouped)
    .map(([key, items]) => ({
      key,
      ...buildTotals(items)
    }))
    .sort((left, right) => right.key.localeCompare(left.key));
}
