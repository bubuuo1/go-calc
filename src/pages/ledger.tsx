import Head from "next/head";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BottomNav from "@/components/BottomNav";
import ErrorBanner from "@/components/ErrorBanner";
import FeedbackToast from "@/components/FeedbackToast";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { deleteTransaction, getTransactions } from "@/services/api";
import type { Transaction } from "@/types/transaction";
import {
  currentDateKey,
  currentMonthKey,
  isMonthKey,
  monthDateRange,
  shiftMonthKey
} from "@/utils/month";
import {
  getStoredMonth,
  hasAppEntered,
  setStoredEditReturnPath,
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
  const loadRequestRef = useRef(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [month, setMonth] = useState(currentMonthKey());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [today, setToday] = useState("");

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setIsLoading(true);
    setToday(currentDateKey());

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

      console.error("달력 데이터를 불러오지 못했습니다.", error);
      setErrorMessage("달력 데이터를 불러오지 못했습니다. 연결을 확인해 주세요.");
    } finally {
      if (requestId === loadRequestRef.current) {
        setIsLoading(false);
      }
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
    const queryUpdated = router.query.updated;
    const nextMonth = isMonthKey(queryMonth) ? queryMonth : getStoredMonth();
    setMonth(nextMonth);
    setStoredMonth(nextMonth);

    if (queryUpdated === "1") {
      setFeedbackMessage("거래를 수정했습니다.");
    }

    if (isMonthKey(queryMonth) || queryUpdated === "1") {
      void router.replace(router.pathname, undefined, { shallow: true });
    }
  }, [router.isReady, router.query.month, router.query.updated]);

  const calendarDays = useMemo(
    () => buildMonthDays(month).map((day) => buildDaySummary(day, transactions)),
    [month, transactions]
  );

  const selectedDay = useMemo(
    () => calendarDays.find((day) => day?.date === selectedDate) || null,
    [calendarDays, selectedDate]
  );

  const monthLabel = useMemo(() => {
    const [year, monthNumber] = month.split("-").map(Number);
    return year + "년 " + monthNumber + "월";
  }, [month]);

  const changeMonth = (delta: number) => {
    const nextMonth = shiftMonthKey(month, delta);
    setMonth(nextMonth);
    setStoredMonth(nextMonth);
    setSelectedDate(null);
  };

  const remove = async (id: string) => {
    if (deletingId) {
      return;
    }

    if (!window.confirm("선택한 거래를 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.")) {
      return;
    }

    try {
      setErrorMessage(null);
      setDeletingId(id);
      await deleteTransaction(id);
      await load();
      setFeedbackMessage("거래를 삭제했습니다.");
    } catch (error) {
      console.error("거래를 삭제하지 못했습니다.", error);
      setErrorMessage("거래를 삭제하지 못했습니다. 목록을 새로고침해 확인해 주세요.");
    } finally {
      setDeletingId(null);
    }
  };

  const edit = (id: string) => {
    setStoredEditTransactionId(id);
    setStoredEditReturnPath("/ledger");
    router.replace("/");
  };

  const addTransaction = (date: string) => {
    void router.replace({ pathname: "/", query: { date } });
  };

  const closeDaySheet = useCallback(() => {
    setSelectedDate(null);
  }, []);

  return (
    <>
      <Head>
        <title>달력 | 솔샘네 가계부</title>
        <meta name="description" content="월간 달력" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <ErrorBanner
        message={errorMessage}
        onDismiss={() => setErrorMessage(null)}
        onRetry={() => void load()}
      />

      <FeedbackToast
        message={feedbackMessage}
        onDismiss={() => setFeedbackMessage(null)}
        tone="success"
      />

      <main className="min-h-screen bg-gradient-to-b from-blue-50 via-slate-50 to-white pb-24 text-slate-950">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 py-4 sm:px-5 sm:py-6">
          <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-blue-700 via-blue-600 to-sky-500 p-5 text-white shadow-lg shadow-blue-200/70">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-blue-100">솔샘네 가계부</p>
                <h1 className="mt-1 text-2xl font-black tracking-tight">월간 달력</h1>
                <p className="mt-1 text-xs font-medium text-blue-100">
                  날짜별 지출과 거래 내역을 한눈에 확인해요.
                </p>
              </div>
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25">
                <svg aria-hidden="true" className="h-6 w-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M8 2v4" />
                  <path d="M16 2v4" />
                  <rect height="18" rx="3" width="18" x="3" y="4" />
                  <path d="M3 10h18" />
                  <path d="M8 14h.01" />
                  <path d="M12 14h.01" />
                  <path d="M16 14h.01" />
                </svg>
              </span>
            </div>
          </header>

          <section className="overflow-hidden rounded-3xl border border-blue-100 bg-white p-3 shadow-sm shadow-blue-100/70 sm:p-5">
            <div className="flex items-center justify-between gap-3 px-1">
              <button
                aria-label="이전 달"
                className="grid h-11 w-11 place-items-center rounded-full border border-blue-100 bg-blue-50 text-blue-700 transition hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                type="button"
                onClick={() => changeMonth(-1)}
              >
                <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <div className="text-center">
                <p className="text-lg font-black text-slate-950">{monthLabel}</p>
                <p className="mt-0.5 text-[11px] font-bold text-slate-400">
                  날짜를 눌러 상세 내역을 확인하세요
                </p>
              </div>
              <button
                aria-label="다음 달"
                className="grid h-11 w-11 place-items-center rounded-full border border-blue-100 bg-blue-50 text-blue-700 transition hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                type="button"
                onClick={() => changeMonth(1)}
              >
                <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>

            <div
              aria-busy={isLoading}
              className="mt-4 overflow-hidden rounded-2xl border border-slate-100 bg-white"
            >
              <div className="grid grid-cols-7 border-b border-slate-100 bg-blue-50/60">
                {["일", "월", "화", "수", "목", "금", "토"].map((day, index) => (
                  <div
                    key={day}
                    className={[
                      "px-1 py-2 text-center text-[11px] font-black",
                      index === 0
                        ? "text-rose-500"
                        : index === 6
                          ? "text-blue-600"
                          : "text-slate-500"
                    ].join(" ")}
                  >
                    {day}
                  </div>
                ))}
              </div>

              {isLoading ? (
                <div className="grid grid-cols-7" role="status">
                  <span className="sr-only">달력 데이터를 불러오는 중입니다.</span>
                  {calendarDays.map((day, index) => (
                    <div
                      key={day?.date || "loading-empty-" + index}
                      className="min-h-[70px] border-b border-r border-slate-100 p-1.5 sm:min-h-20"
                    >
                      {day ? (
                        <div className="animate-pulse">
                          <span className="block h-3 w-3 rounded bg-blue-100" />
                          <span className="mt-4 block h-2 w-full rounded bg-slate-100" />
                          <span className="mt-1 block h-2 w-2/3 rounded bg-slate-100" />
                        </div>
                      ) : null}
                    </div>
                  ))}
                  <p className="col-span-7 bg-blue-50/50 py-2 text-center text-xs font-bold text-blue-600">
                    달력 불러오는 중...
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-7">
                  {calendarDays.map((day, index) => {
                    const transactionCount = day?.transactions.length || 0;
                    const isToday = day?.date === today;
                    const isSelected = day?.date === selectedDate;
                    const weekdayTone =
                      index % 7 === 0
                        ? "text-rose-500"
                        : index % 7 === 6
                          ? "text-blue-600"
                          : "text-slate-700";

                    return (
                      <button
                        key={day?.date || "empty-" + index}
                        aria-label={
                          day
                            ? day.date +
                              ", 거래 " +
                              transactionCount +
                              "건, 지출 " +
                              currency.format(day.expense)
                            : undefined
                        }
                        className={[
                          "relative min-h-[70px] min-w-0 overflow-hidden border-b border-r border-slate-100 px-1 py-1.5 text-left transition disabled:bg-slate-50/30 sm:min-h-20 sm:p-2",
                          day ? "hover:bg-blue-50" : "",
                          isToday ? "z-10 bg-blue-50 ring-2 ring-inset ring-blue-500" : "",
                          isSelected ? "bg-blue-100" : ""
                        ].join(" ")}
                        disabled={!day}
                        type="button"
                        onClick={() => day && setSelectedDate(day.date)}
                      >
                        {day ? (
                          <>
                            <div className="flex items-center justify-between gap-0.5">
                              <span className={["text-xs font-black", weekdayTone].join(" ")}>
                                {day.dayNumber}
                              </span>
                              {transactionCount > 0 ? (
                                <span className="rounded-full bg-blue-100 px-1 py-0.5 text-[8px] font-black leading-none text-blue-700 sm:text-[9px]">
                                  {transactionCount}건
                                </span>
                              ) : null}
                            </div>
                            {isToday ? (
                              <span className="mt-1 inline-flex rounded bg-blue-600 px-1 py-0.5 text-[8px] font-black leading-none text-white">
                                오늘
                              </span>
                            ) : null}
                            {transactionCount > 0 ? (
                              <p className="money absolute inset-x-1 bottom-1.5 truncate text-[9px] font-black leading-tight text-rose-500 sm:inset-x-2 sm:text-[11px]">
                                지출 {compactWon(day.expense)}
                              </p>
                            ) : null}
                          </>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-center gap-4 text-[11px] font-bold text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-500" /> 오늘
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-500" /> 날짜별 지출
              </span>
            </div>
          </section>
        </div>

        <BottomNav />

        {selectedDay ? (
          <DaySheet
            day={selectedDay}
            deletingId={deletingId}
            onAdd={addTransaction}
            onClose={closeDaySheet}
            onEdit={edit}
            onRemove={remove}
          />
        ) : null}
      </main>
    </>
  );
}

function DaySheet({
  day,
  deletingId,
  onAdd,
  onClose,
  onEdit,
  onRemove
}: {
  day: NonNullable<ReturnType<typeof buildDaySummary>>;
  deletingId: string | null;
  onAdd: (date: string) => void;
  onClose: () => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => Promise<void>;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sortedTransactions = [...day.transactions].sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "income" ? -1 : 1;
    }

    if (left.type === "expense") {
      return (left.memo || "").localeCompare(right.memo || "", "ko-KR");
    }

    return right.amount - left.amount;
  });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        aria-label="일별 거래 닫기"
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
        type="button"
        onClick={onClose}
      />
      <section
        aria-labelledby="day-sheet-title"
        aria-modal="true"
        className="relative flex max-h-[88dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl"
        role="dialog"
      >
        <div className="shrink-0 px-4 pb-3 pt-2 sm:px-5">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-blue-600">{day.date}</p>
              <h2 id="day-sheet-title" className="mt-1 text-xl font-black text-slate-950">
                일별 거래
              </h2>
            </div>
            <button
              ref={closeButtonRef}
              aria-label="닫기"
              className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-xl leading-none text-slate-500 transition hover:bg-slate-200"
              type="button"
              onClick={onClose}
            >
              ×
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
              <p className="text-xs font-bold text-blue-600">수입 합계</p>
              <p className="money mt-1 text-base font-black text-blue-700">
                {currency.format(day.income)}
              </p>
            </div>
            <div className="rounded-2xl border border-rose-100 bg-rose-50 p-3">
              <p className="text-xs font-bold text-rose-500">지출 합계</p>
              <p className="money mt-1 text-base font-black text-rose-600">
                {currency.format(day.expense)}
              </p>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto border-y border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
          {sortedTransactions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-blue-200 bg-white p-6 text-center">
              <p className="text-sm font-bold text-slate-500">해당 날짜의 거래가 없습니다.</p>
              <p className="mt-1 text-xs text-slate-400">아래 버튼으로 첫 거래를 추가해 보세요.</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {sortedTransactions.map((transaction) => (
                <article
                  key={transaction.id}
                  className="rounded-2xl border border-slate-100 bg-white px-3 py-3 shadow-sm"
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
                      className={[
                        "money shrink-0 text-sm font-black",
                        transaction.type === "income" ? "text-blue-700" : "text-rose-600"
                      ].join(" ")}
                    >
                      {currency.format(transaction.amount)}
                    </p>
                  </div>
                  <div className="mt-2 flex justify-end gap-1.5">
                    <button
                      className="min-h-11 rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={Boolean(deletingId)}
                      type="button"
                      onClick={() => onEdit(transaction.id)}
                    >
                      수정
                    </button>
                    <button
                      className="min-h-11 rounded-lg border border-rose-100 bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={Boolean(deletingId)}
                      type="button"
                      onClick={() => void onRemove(transaction.id)}
                    >
                      {deletingId === transaction.id ? "삭제 중..." : "삭제"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
          <button
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            type="button"
            onClick={() => onAdd(day.date)}
          >
            <span aria-hidden="true" className="text-lg leading-none">+</span>
            이 날짜에 거래 추가
          </button>
        </div>
      </section>
    </div>
  );
}
