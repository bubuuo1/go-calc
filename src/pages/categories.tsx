import Head from "next/head";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BottomNav from "@/components/BottomNav";
import ErrorBanner from "@/components/ErrorBanner";
import StatsSubnav from "@/components/StatsSubnav";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { getTransactions } from "@/services/api";
import type { Transaction } from "@/types/transaction";
import {
  currentMonthKey,
  isMonthKey,
  monthDateRange,
  shiftMonthKey
} from "@/utils/month";
import { getStoredMonth, hasAppEntered, setStoredMonth } from "@/utils/session";

const currency = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0
});

export default function CategoriesPage() {
  const router = useRouter();
  const loadRequestRef = useRef(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [month, setMonth] = useState(currentMonthKey());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;

    try {
      const nextTransactions = await getTransactions(monthDateRange(month));
      if (requestId !== loadRequestRef.current) {
        return;
      }

      setTransactions(nextTransactions);
      setErrorMessage(null);
    } catch (error) {
      if (requestId !== loadRequestRef.current) {
        return;
      }

      console.error("카테고리 데이터를 불러오지 못했습니다.", error);
      setErrorMessage("카테고리 데이터를 불러오지 못했습니다. 연결을 확인해 주세요.");
    }
  }, [month]);

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

      <ErrorBanner
        message={errorMessage}
        onDismiss={() => setErrorMessage(null)}
        onRetry={() => void load()}
      />

      <main className="min-h-screen bg-slate-50 pb-28 text-slate-950">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5 sm:px-5 lg:px-6">
          <header className="rounded-2xl bg-gradient-to-br from-blue-700 to-blue-600 p-5 text-white shadow-lg shadow-blue-200/60">
            <p className="text-xs font-black tracking-[0.18em] text-blue-100">솔샘네 가계부</p>
            <h1 className="mt-2 text-2xl font-black">어디에 많이 썼을까요?</h1>
            <p className="mt-1 text-sm font-bold text-blue-100">카테고리별 지출 비중을 비교해요.</p>
          </header>

          <StatsSubnav />

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
        <BottomNav />
      </main>
    </>
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
    primary: "text-blue-950"
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
