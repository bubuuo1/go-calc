import Head from "next/head";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BottomNav from "@/components/BottomNav";
import ErrorBanner from "@/components/ErrorBanner";
import StatsSubnav from "@/components/StatsSubnav";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { getTransactions } from "@/services/api";
import type { Transaction } from "@/types/transaction";
import { currentMonthKey, isMonthKey, yearDateRange } from "@/utils/month";
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
  const loadRequestRef = useRef(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedYear, setSelectedYear] = useState(currentMonthKey().slice(0, 4));
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;

    try {
      const nextTransactions = await getTransactions(yearDateRange(selectedYear));
      if (requestId !== loadRequestRef.current) {
        return;
      }

      setTransactions(nextTransactions);
      setErrorMessage(null);
    } catch (error) {
      if (requestId !== loadRequestRef.current) {
        return;
      }

      console.error("전체 통계를 불러오지 못했습니다.", error);
      setErrorMessage("전체 통계를 불러오지 못했습니다. 연결을 확인해 주세요.");
    }
  }, [selectedYear]);

  useEffect(() => {
    void load();
  }, [load]);

  useRefreshOnFocus(load);

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
    const nextYear = String(Number(selectedYear) + delta);
    const nextMonth = `${nextYear}-${selectedMonth.slice(5, 7)}`;
    setSelectedYear(nextYear);
    setSelectedMonth(nextMonth);
    setStoredMonth(nextMonth);
  };

  return (
    <>
      <Head>
        <title>전체 통계 | 솔샘네 가계부</title>
        <meta name="description" content="월별 연도별 수입 지출 잔액 통계" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <ErrorBanner
        message={errorMessage}
        onDismiss={() => setErrorMessage(null)}
        onRetry={() => void load()}
      />

      <main className="min-h-screen bg-slate-50 pb-28 text-slate-950">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <header className="rounded-2xl bg-gradient-to-br from-blue-700 to-blue-600 p-5 text-white shadow-lg shadow-blue-200/60">
            <p className="text-xs font-black tracking-[0.18em] text-blue-100">솔샘네 가계부</p>
            <h1 className="mt-2 text-2xl font-black">한 해를 한눈에</h1>
            <p className="mt-1 text-sm font-bold text-blue-100">월별 수입과 지출, 잔액을 비교해요.</p>
          </header>

          <StatsSubnav />

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
        <BottomNav />
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
    income: "text-blue-600",
    expense: "text-red-600",
    primary: "text-blue-950"
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
