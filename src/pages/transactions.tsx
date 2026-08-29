import Head from "next/head";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BottomNav from "@/components/BottomNav";
import ErrorBanner from "@/components/ErrorBanner";
import FeedbackToast from "@/components/FeedbackToast";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { deleteTransaction, getCategories, getTransactions } from "@/services/api";
import type { Transaction, TransactionType } from "@/types/transaction";
import {
  currentMonthKey,
  isMonthKey,
  monthDateRange,
  shiftMonthKey
} from "@/utils/month";
import {
  getStoredMonth,
  setStoredEditReturnPath,
  setStoredEditTransactionId,
  setStoredMonth
} from "@/utils/session";
import {
  DEFAULT_CATEGORIES,
  inputterLabel,
  paymentLabel,
  transactionTypeLabel
} from "@/utils/ledger";

const VISIBLE_INCREMENT = 20;

const currency = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0
});

const dateLabel = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  weekday: "short",
  timeZone: "Asia/Seoul"
});

type TransactionGroup = {
  date: string;
  transactions: Transaction[];
  income: number;
  expense: number;
};

export default function TransactionsPage() {
  const router = useRouter();
  const loadRequestRef = useRef(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [month, setMonth] = useState(currentMonthKey());
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | TransactionType>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(VISIBLE_INCREMENT);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<Transaction | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setIsLoading(true);

    try {
      const [nextTransactions, nextCategories] = await Promise.all([
        getTransactions(monthDateRange(month)),
        getCategories()
      ]);

      if (requestId !== loadRequestRef.current) {
        return;
      }

      setTransactions(nextTransactions);
      setCategories(nextCategories.length > 0 ? nextCategories : DEFAULT_CATEGORIES);
      setErrorMessage(null);
    } catch (error) {
      if (requestId !== loadRequestRef.current) {
        return;
      }

      console.error("거래 목록을 불러오지 못했습니다.", error);
      setErrorMessage("거래 목록을 불러오지 못했습니다. 연결을 확인해 주세요.");
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

    const queryMonth = router.query.month;
    const queryUpdated = router.query.updated;
    const nextMonth = isMonthKey(queryMonth) ? queryMonth : getStoredMonth();
    setMonth(nextMonth || currentMonthKey());
    setStoredMonth(nextMonth || currentMonthKey());

    if (queryUpdated === "1") {
      setFeedbackMessage("거래를 수정했습니다.");
    }

    if (isMonthKey(queryMonth) || queryUpdated === "1") {
      void router.replace(router.pathname, undefined, { shallow: true });
    }
  }, [router.isReady, router.query.month, router.query.updated]);

  useEffect(() => {
    if (!deleteCandidate) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isDeleting) {
        setDeleteCandidate(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [deleteCandidate, isDeleting]);

  const filteredTransactions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");

    return transactions.filter((transaction) => {
      const matchesMonth = transaction.date.startsWith(month);
      const searchableText = `${transaction.memo} ${transaction.category} ${
        paymentLabel[transaction.paymentMethod] || ""
      } ${inputterLabel[transaction.inputter || "husband"] || ""}`.toLocaleLowerCase(
        "ko-KR"
      );
      const matchesQuery = !normalizedQuery || searchableText.includes(normalizedQuery);
      const matchesType = typeFilter === "all" || transaction.type === typeFilter;
      const matchesCategory =
        categoryFilter === "all" || transaction.category === categoryFilter;

      return matchesMonth && matchesQuery && matchesType && matchesCategory;
    });
  }, [categoryFilter, month, query, transactions, typeFilter]);

  useEffect(() => {
    setVisibleCount(VISIBLE_INCREMENT);
  }, [categoryFilter, month, query, typeFilter]);

  const groupedTransactions = useMemo(() => {
    const visibleTransactions = filteredTransactions.slice(0, visibleCount);
    const totalsByDate = new Map<string, { income: number; expense: number }>();

    visibleTransactions.forEach((transaction) => {
      const totals = totalsByDate.get(transaction.date) || { income: 0, expense: 0 };
      if (transaction.type === "income") {
        totals.income += transaction.amount;
      } else {
        totals.expense += transaction.amount;
      }
      totalsByDate.set(transaction.date, totals);
    });

    const groups = new Map<string, TransactionGroup>();

    visibleTransactions.forEach((transaction) => {
      const existing = groups.get(transaction.date);
      if (existing) {
        existing.transactions.push(transaction);
        return;
      }

      const totals = totalsByDate.get(transaction.date) || { income: 0, expense: 0 };
      groups.set(transaction.date, {
        date: transaction.date,
        transactions: [transaction],
        income: totals.income,
        expense: totals.expense
      });
    });

    return Array.from(groups.values());
  }, [filteredTransactions, visibleCount]);

  const shiftMonth = (delta: number) => {
    const nextMonth = shiftMonthKey(month, delta);
    setMonth(nextMonth);
    setStoredMonth(nextMonth);
  };

  const edit = (id: string) => {
    setStoredEditTransactionId(id);
    setStoredEditReturnPath("/transactions");
    router.replace("/");
  };

  const remove = async () => {
    if (!deleteCandidate || isDeleting) {
      return;
    }

    const transactionToDelete = deleteCandidate;
    setIsDeleting(true);

    try {
      setErrorMessage(null);
      await deleteTransaction(transactionToDelete.id);
      setDeleteCandidate(null);
      setTransactions((current) =>
        current.filter((transaction) => transaction.id !== transactionToDelete.id)
      );
      setFeedbackMessage(
        `‘${transactionToDelete.memo || "제목 없는 거래"}’ 거래를 삭제했습니다.`
      );
      await load();
    } catch (error) {
      console.error("거래를 삭제하지 못했습니다.", error);
      setErrorMessage("거래를 삭제하지 못했습니다. 목록을 새로고침해 확인해 주세요.");
    } finally {
      setIsDeleting(false);
    }
  };

  const displayedCount = Math.min(visibleCount, filteredTransactions.length);
  const hasMore = displayedCount < filteredTransactions.length;

  return (
    <>
      <Head>
        <title>거래 내역 | 솔샘네 가계부</title>
        <meta name="description" content="날짜별 가계부 거래 내역" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <ErrorBanner
        message={errorMessage}
        onDismiss={() => setErrorMessage(null)}
        onRetry={() => void load()}
      />

      <FeedbackToast
        message={feedbackMessage}
        tone="success"
        onDismiss={() => setFeedbackMessage(null)}
      />

      <main className="min-h-screen bg-slate-50 pb-24 text-slate-950">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-4 sm:px-5 lg:px-6">
          <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 p-5 text-white shadow-lg shadow-blue-200/70">
            <div className="flex items-center gap-3">
              <span className="flex -space-x-2">
                <img
                  alt=""
                  className="h-11 w-11 rounded-full border-2 border-white/90 object-cover shadow-sm"
                  src="/images/header-2.png"
                />
                <img
                  alt=""
                  className="h-11 w-11 rounded-full border-2 border-white/90 object-cover shadow-sm"
                  src="/images/header-3.png"
                />
              </span>
              <div>
                <p className="text-xs font-bold text-blue-100">솔샘네 가계부</p>
                <h1 className="mt-0.5 text-xl font-black tracking-tight">거래 내역</h1>
              </div>
            </div>
            <p className="mt-4 text-sm font-medium leading-6 text-blue-50">
              날짜별 흐름을 한눈에 보고 필요한 거래를 빠르게 찾아보세요.
            </p>
          </header>

          <section className="flex items-center justify-between rounded-2xl border border-blue-100 bg-white p-2 shadow-sm">
            <button
              aria-label="이전 달"
              className="flex h-11 w-11 items-center justify-center rounded-xl text-blue-700 transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              type="button"
              onClick={() => shiftMonth(-1)}
            >
              <Chevron direction="left" />
            </button>
            <div className="text-center">
              <p className="text-[11px] font-bold text-slate-400">조회 기간</p>
              <strong className="text-base font-black text-slate-950">{month}</strong>
            </div>
            <button
              aria-label="다음 달"
              className="flex h-11 w-11 items-center justify-center rounded-xl text-blue-700 transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              type="button"
              onClick={() => shiftMonth(1)}
            >
              <Chevron direction="right" />
            </button>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            <label className="relative block">
              <span className="sr-only">거래 검색</span>
              <SearchIcon />
              <input
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-medium outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="제목, 카테고리, 결제수단 검색"
                type="search"
              />
            </label>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {(
                [
                  ["all", "전체"],
                  ["expense", "지출"],
                  ["income", "수입"]
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={typeFilter === value}
                  className={`min-h-11 shrink-0 rounded-full px-4 py-2 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
                    typeFilter === value
                      ? "bg-blue-600 text-white shadow-sm shadow-blue-200"
                      : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                  }`}
                  type="button"
                  onClick={() => setTypeFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            <label className="mt-3 grid gap-1.5 text-xs font-bold text-slate-500 sm:max-w-xs">
              카테고리
              <select
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="all">전체 카테고리</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section aria-busy={isLoading} aria-live="polite">
            <div className="mb-3 flex items-end justify-between gap-3 px-1">
              <div>
                <h2 className="text-base font-black text-slate-950">날짜별 거래</h2>
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  {isLoading
                    ? "거래 내역을 불러오는 중입니다."
                    : `총 ${filteredTransactions.length}건 중 ${displayedCount}건 표시`}
                </p>
              </div>
            </div>

            {isLoading ? (
              <TimelineSkeleton />
            ) : groupedTransactions.length === 0 ? (
              <EmptyState
                hasFilter={Boolean(query || typeFilter !== "all" || categoryFilter !== "all")}
              />
            ) : (
              <div className="grid gap-5">
                {groupedTransactions.map((group) => (
                  <DateGroup
                    key={group.date}
                    group={group}
                    onEdit={edit}
                    onRemove={setDeleteCandidate}
                  />
                ))}
              </div>
            )}

            {!isLoading && hasMore ? (
              <button
                className="mt-5 h-12 w-full rounded-2xl border border-blue-200 bg-white text-sm font-black text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 focus:outline-none focus:ring-4 focus:ring-blue-100"
                type="button"
                onClick={() => setVisibleCount((current) => current + VISIBLE_INCREMENT)}
              >
                {Math.min(VISIBLE_INCREMENT, filteredTransactions.length - displayedCount)}건 더 보기
              </button>
            ) : null}
          </section>
        </div>
      </main>

      <BottomNav />

      {deleteCandidate ? (
        <DeleteConfirmation
          isDeleting={isDeleting}
          transaction={deleteCandidate}
          onCancel={() => setDeleteCandidate(null)}
          onConfirm={() => void remove()}
        />
      ) : null}
    </>
  );
}

function DateGroup({
  group,
  onEdit,
  onRemove
}: {
  group: TransactionGroup;
  onEdit: (id: string) => void;
  onRemove: (transaction: Transaction) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
        <h3 className="text-sm font-black text-slate-900">{formatDateLabel(group.date)}</h3>
        <div className="flex items-center gap-2 text-[11px] font-black">
          {group.income > 0 ? (
            <span className="text-blue-600">수입 {currency.format(group.income)}</span>
          ) : null}
          {group.expense > 0 ? (
            <span className="text-rose-600">지출 {currency.format(group.expense)}</span>
          ) : null}
        </div>
      </div>
      <div className="relative grid gap-2 pl-4 before:absolute before:bottom-4 before:left-[5px] before:top-4 before:w-px before:bg-blue-100">
        {group.transactions.map((transaction) => (
          <TransactionRow
            key={transaction.id}
            transaction={transaction}
            onEdit={onEdit}
            onRemove={onRemove}
          />
        ))}
      </div>
    </section>
  );
}

function TransactionRow({
  onEdit,
  onRemove,
  transaction
}: {
  onEdit: (id: string) => void;
  onRemove: (transaction: Transaction) => void;
  transaction: Transaction;
}) {
  const isIncome = transaction.type === "income";
  const isPending = transaction.syncStatus === "pending";

  return (
    <article className="relative rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-blue-200 hover:shadow-md">
      <span className="absolute -left-[15px] top-5 h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-500 shadow-sm" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black ${
                isIncome ? "bg-blue-50 text-blue-700" : "bg-rose-50 text-rose-700"
              }`}
            >
              {transactionTypeLabel[transaction.type]}
            </span>
            {isPending ? (
              <span className="shrink-0 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-black text-amber-700">
                동기화 대기
              </span>
            ) : null}
            <h4 className="truncate text-sm font-black text-slate-950">
              {transaction.memo || "제목 없음"}
            </h4>
          </div>
          <p className="mt-1.5 truncate text-[11px] font-medium text-slate-500 sm:text-xs">
            {transaction.category} · {paymentLabel[transaction.paymentMethod || "card"]} ·{" "}
            {inputterLabel[transaction.inputter || "husband"]}
          </p>
        </div>
        <p
          className={`money shrink-0 text-sm font-black ${
            isIncome ? "text-blue-600" : "text-rose-600"
          }`}
        >
          {isIncome ? "+" : "-"}
          {currency.format(transaction.amount)}
        </p>
      </div>
      <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-2.5">
        <button
          className="min-h-11 rounded-lg px-3 py-1.5 text-xs font-black text-blue-700 transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          disabled={isPending}
          type="button"
          onClick={() => onEdit(transaction.id)}
        >
          수정
        </button>
        <button
          className="min-h-11 rounded-lg px-3 py-1.5 text-xs font-black text-rose-600 transition hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
          disabled={isPending}
          type="button"
          onClick={() => onRemove(transaction)}
        >
          삭제
        </button>
      </div>
    </article>
  );
}

function DeleteConfirmation({
  isDeleting,
  onCancel,
  onConfirm,
  transaction
}: {
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  transaction: Transaction;
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    cancelButtonRef.current?.focus();

    return () => previousFocus?.focus();
  }, [transaction.id]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isDeleting) {
          onCancel();
        }
      }}
    >
      <section
        aria-describedby="delete-transaction-description"
        aria-labelledby="delete-transaction-title"
        aria-modal="true"
        className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-sm sm:rounded-3xl"
        role="dialog"
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
          <TrashIcon />
        </span>
        <h2 id="delete-transaction-title" className="mt-4 text-lg font-black text-slate-950">
          이 거래를 삭제할까요?
        </h2>
        <p id="delete-transaction-description" className="mt-1 text-sm leading-6 text-slate-500">
          삭제한 거래는 되돌릴 수 없습니다.
        </p>
        <div className="mt-4 rounded-2xl bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-900">
                {transaction.memo || "제목 없는 거래"}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500">
                {transaction.date} · {transaction.category}
              </p>
            </div>
            <strong className="money shrink-0 text-sm text-slate-950">
              {currency.format(transaction.amount)}
            </strong>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            ref={cancelButtonRef}
            className="h-11 rounded-xl bg-slate-100 text-sm font-black text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isDeleting}
            type="button"
            onClick={onCancel}
          >
            취소
          </button>
          <button
            className="h-11 rounded-xl bg-rose-600 text-sm font-black text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isDeleting}
            type="button"
            onClick={onConfirm}
          >
            {isDeleting ? "삭제 중..." : "삭제"}
          </button>
        </div>
      </section>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="grid animate-pulse gap-5" aria-hidden="true">
      {[0, 1].map((group) => (
        <div key={group}>
          <div className="mb-2 h-4 w-28 rounded bg-slate-200" />
          <div className="grid gap-2 pl-4">
            {[0, 1].map((row) => (
              <div key={row} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="flex justify-between gap-4">
                  <div className="h-4 w-32 rounded bg-slate-200" />
                  <div className="h-4 w-20 rounded bg-slate-200" />
                </div>
                <div className="mt-3 h-3 w-44 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="rounded-3xl border border-dashed border-blue-200 bg-blue-50/50 px-5 py-12 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm">
        <SearchIcon standalone />
      </span>
      <p className="mt-4 text-sm font-black text-slate-900">
        {hasFilter ? "조건에 맞는 거래가 없습니다." : "이 달에 등록된 거래가 없습니다."}
      </p>
      <p className="mt-1 text-xs font-medium text-slate-500">
        {hasFilter ? "검색어나 필터를 바꿔 보세요." : "가계부에서 첫 거래를 추가해 보세요."}
      </p>
    </div>
  );
}

function SearchIcon({ standalone = false }: { standalone?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={
        standalone
          ? "h-5 w-5"
          : "pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400"
      }
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.5"
      viewBox="0 0 24 24"
    >
      <path d={direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="m19 6-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

function formatDateLabel(date: string) {
  return dateLabel.format(new Date(`${date}T00:00:00+09:00`));
}
