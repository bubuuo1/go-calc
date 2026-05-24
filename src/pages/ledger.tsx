import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { deleteTransaction, getTransactions } from "@/services/api";
import type { Transaction } from "@/types/transaction";
import { currentMonthKey, isMonthKey, shiftMonthKey } from "@/utils/month";
import {
  getStoredMonth,
  hasAppEntered,
  setStoredEditTransactionId,
  setStoredMonth
} from "@/utils/session";
import {
  buildDaySummary,
  buildMonthDays,
  compactWon,
  inputterLabel,
  transactionTypeLabel
} from "@/utils/ledger";

const currency = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0
});

export default function LedgerPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [month, setMonth] = useState(currentMonthKey());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const load = async () => {
    try {
      setTransactions(await getTransactions());
    } catch {
      setTransactions([]);
    }
  };

  useEffect(() => {
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

  const calendarDays = useMemo(
    () => buildMonthDays(month).map((day) => buildDaySummary(day, transactions)),
    [month, transactions]
  );

  const selectedDay = useMemo(
    () => calendarDays.find((day) => day?.date === selectedDate) || null,
    [calendarDays, selectedDate]
  );

  const changeMonth = (delta: number) => {
    const nextMonth = shiftMonthKey(month, delta);
    setMonth(nextMonth);
    setStoredMonth(nextMonth);
    setSelectedDate(null);
  };

  const remove = async (id: string) => {
    try {
      await deleteTransaction(id);
      await load();
    } catch {}
  };

  const edit = (id: string) => {
    setStoredEditTransactionId(id);
    router.replace("/");
  };

  return (
    <>
      <Head>
        <title>달력 | 솔샘네 가계부</title>
        <meta name="description" content="월간 달력" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="min-h-screen bg-slate-50 text-slate-950">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-5 lg:px-6">
          <header className="border-b border-slate-200 pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
              <p className="text-lg font-black tracking-normal text-slate-900">
                솔샘네 가계부
              </p>
              </div>
              <Link
                aria-label="가계부"
                className="flex h-12 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-400 hover:text-slate-950"
                href="/"
                replace
                title="가계부"
              >
                <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M3 11l9-8 9 8" />
                  <path d="M5 10v10h14V10" />
                  <path d="M9 20v-6h6v6" />
                </svg>
                <span className="whitespace-nowrap text-[8px] font-black leading-none">가계부</span>
              </Link>
            </div>
          </header>

          <section className="panel p-3">
              <div className="flex justify-center">
                <div className="flex items-center gap-2">
                  <button className="btn-small" type="button" onClick={() => changeMonth(-1)}>
                    이전
                  </button>
                  <strong className="min-w-24 text-center text-base">{month}</strong>
                  <button className="btn-small" type="button" onClick={() => changeMonth(1)}>
                    다음
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-7 overflow-hidden rounded-md border border-slate-200 bg-white">
                {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                  <div
                    key={day}
                    className="border-b border-slate-200 bg-slate-50 px-1 py-1.5 text-center text-[11px] font-black text-slate-600"
                  >
                    {day}
                  </div>
                ))}
                {calendarDays.map((day, index) => {
                  const total = day ? day.income - day.expense : 0;
                  return (
                    <button
                      key={day?.date || `empty-${index}`}
                      className="min-h-[58px] min-w-0 overflow-hidden border-b border-r border-slate-100 px-1 py-1 text-left last:border-r-0 transition hover:bg-slate-50 disabled:bg-white sm:min-h-16 sm:p-1.5"
                      disabled={!day}
                      type="button"
                      onClick={() => day && setSelectedDate(day.date)}
                    >
                      {day ? (
                        <>
                          <p className="text-xs font-black text-slate-950">{day.dayNumber}</p>
                          <div className="mt-0.5 min-w-0 leading-none sm:mt-1">
                            <p
                              className={`money mt-1 block max-w-full truncate text-[10px] font-black leading-tight sm:text-[11px] ${
                                total < 0 ? "text-red-600" : "text-slate-600"
                              }`}
                            >
                              {total === 0
                                ? "0"
                                : `${total > 0 ? "+" : "-"}${compactWon(Math.abs(total))}`}
                            </p>
                          </div>
                        </>
                      ) : null}
                    </button>
                  );
                })}
              </div>
          </section>
        </div>

        {selectedDay ? (
          <DayPopup day={selectedDay} onClose={() => setSelectedDate(null)} onEdit={edit} onRemove={remove} />
        ) : null}
      </main>
    </>
  );
}

function DayPopup({
  day,
  onClose,
  onEdit,
  onRemove
}: {
  day: NonNullable<ReturnType<typeof buildDaySummary>>;
  onClose: () => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const sortedTransactions = [...day.transactions].sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "income" ? -1 : 1;
    }

    if (left.type === "expense") {
      return (left.memo || "").localeCompare(right.memo || "", "ko-KR");
    }

    return right.amount - left.amount;
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4 backdrop-blur-sm">
      <section className="panel flex max-h-[82vh] w-full max-w-md flex-col overflow-hidden p-4">
        <div className="shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-slate-500">{day.date}</p>
              <h2 className="mt-1 text-xl font-black">일별 거래</h2>
            </div>
            <button className="btn-small" type="button" onClick={onClose}>
              닫기
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-500">수입 합계</p>
              <p className="money mt-1 text-base font-black text-slate-600">
                {currency.format(day.income)}
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-500">지출 합계</p>
              <p className="money mt-1 text-base font-black text-red-600">
                {currency.format(day.expense)}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 min-h-0 overflow-y-auto rounded-md border border-slate-200">
          {sortedTransactions.length === 0 ? (
            <p className="p-5 text-center text-sm text-slate-500">해당 날짜의 거래가 없습니다.</p>
          ) : (
            sortedTransactions.map((transaction) => (
              <article
                key={transaction.id}
                className="border-b border-slate-100 bg-white px-3 py-2 last:border-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950">
                      {transaction.memo || "제목 없음"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {transactionTypeLabel[transaction.type]} · {transaction.category} ·{" "}
                      {inputterLabel[transaction.inputter || "husband"]}
                    </p>
                  </div>
                  <p
                    className={`money shrink-0 text-sm font-black ${
                      transaction.type === "income" ? "text-slate-600" : "text-red-600"
                    }`}
                  >
                      {currency.format(transaction.amount)}
                  </p>
                </div>
                <div className="mt-2 flex justify-end gap-1.5">
                  <button className="btn-small" type="button" onClick={() => onEdit(transaction.id)}>
                    수정
                  </button>
                  <button
                    className="btn-small-danger"
                    type="button"
                    onClick={() => onRemove(transaction.id)}
                  >
                    삭제
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
