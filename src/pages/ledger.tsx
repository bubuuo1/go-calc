import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { deleteTransaction, getCategories, getTransactions } from "@/services/api";
import type { Transaction, TransactionType } from "@/types/transaction";
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
  DEFAULT_CATEGORIES,
  inputterLabel,
  paymentLabel,
  transactionTypeLabel
} from "@/utils/ledger";

const PAGE_SIZE = 5;

const currency = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0
});

export default function LedgerPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [month, setMonth] = useState(currentMonthKey());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | TransactionType>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage] = useState(1);

  const load = async () => {
    try {
      const [nextTransactions, nextCategories] = await Promise.all([
        getTransactions(),
        getCategories()
      ]);
      setTransactions(nextTransactions);
      setCategories(nextCategories.length > 0 ? nextCategories : DEFAULT_CATEGORIES);
    } catch {
      setTransactions([]);
      setCategories(DEFAULT_CATEGORIES);
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

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const matchesQuery = `${transaction.memo} ${transaction.category} ${
        paymentLabel[transaction.paymentMethod] || ""
      } ${inputterLabel[transaction.inputter || "husband"] || ""}`
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesType = typeFilter === "all" || transaction.type === typeFilter;
      const matchesCategory =
        categoryFilter === "all" || transaction.category === categoryFilter;

      return matchesQuery && matchesType && matchesCategory;
    });
  }, [categoryFilter, query, transactions, typeFilter]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, query, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedTransactions = filteredTransactions.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
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

  return (
    <>
      <Head>
        <title>달력 및 거래리스트 | 고태윤 가계부</title>
        <meta name="description" content="월간 달력과 거래리스트" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="min-h-screen bg-slate-50 text-slate-950">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-5 lg:px-6">
          <header className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                고태윤 가계부
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-normal text-slate-950">
                달력 및 거래리스트
              </h1>
            </div>
            <Link className="btn-secondary inline-flex h-10 items-center justify-center" href="/" replace>
              가계부
            </Link>
          </header>

          <section className="grid gap-4 xl:grid-cols-[1fr_420px]">
            <section className="panel p-3">
              <div className="flex flex-col items-center gap-2 text-center md:flex-row md:justify-between md:text-left">
                <h2 className="text-base font-black">월간 달력</h2>
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
                      className="min-h-16 border-b border-r border-slate-100 p-1.5 text-left last:border-r-0 transition hover:bg-slate-50 disabled:bg-white"
                      disabled={!day}
                      type="button"
                      onClick={() => day && setSelectedDate(day.date)}
                    >
                      {day ? (
                        <>
                          <p className="text-xs font-black text-slate-950">{day.dayNumber}</p>
                          <p
                            className={`money mt-1 text-[10px] font-black ${
                              total < 0 ? "text-red-600" : "text-slate-600"
                            }`}
                          >
                            합계 {total === 0 ? "0" : `${total > 0 ? "+" : "-"}${compactWon(Math.abs(total))}`}
                          </p>
                        </>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>

            <TransactionList
              categories={categories}
              categoryFilter={categoryFilter}
              currentPage={currentPage}
              onCategoryFilterChange={setCategoryFilter}
              onEdit={(id) => {
                setStoredEditTransactionId(id);
                router.replace("/");
              }}
              onPageChange={setPage}
              onQueryChange={setQuery}
              onRemove={remove}
              onTypeFilterChange={setTypeFilter}
              pagedTransactions={pagedTransactions}
              query={query}
              totalCount={filteredTransactions.length}
              totalPages={totalPages}
              typeFilter={typeFilter}
            />
          </section>
        </div>

        {selectedDay ? (
          <DayPopup day={selectedDay} onClose={() => setSelectedDate(null)} />
        ) : null}
      </main>
    </>
  );
}

function TransactionList({
  categories,
  categoryFilter,
  currentPage,
  onCategoryFilterChange,
  onEdit,
  onPageChange,
  onQueryChange,
  onRemove,
  onTypeFilterChange,
  pagedTransactions,
  query,
  totalCount,
  totalPages,
  typeFilter
}: {
  categories: string[];
  categoryFilter: string;
  currentPage: number;
  onCategoryFilterChange: (category: string) => void;
  onEdit: (id: string) => void;
  onPageChange: (updater: (value: number) => number) => void;
  onQueryChange: (query: string) => void;
  onRemove: (id: string) => void;
  onTypeFilterChange: (type: "all" | TransactionType) => void;
  pagedTransactions: Transaction[];
  query: string;
  totalCount: number;
  totalPages: number;
  typeFilter: "all" | TransactionType;
}) {
  return (
    <section className="panel p-3">
      <div className="grid gap-2">
        <input
          className="input"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="제목, 카테고리, 결제수단 검색"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            className="input"
            value={typeFilter}
            onChange={(event) => onTypeFilterChange(event.target.value as "all" | TransactionType)}
          >
            <option value="all">전체 유형</option>
            <option value="income">수입</option>
            <option value="expense">지출</option>
          </select>
          <select
            className="input"
            value={categoryFilter}
            onChange={(event) => onCategoryFilterChange(event.target.value)}
          >
            <option value="all">전체 카테고리</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
        {pagedTransactions.length === 0 ? (
          <p className="p-5 text-center text-sm text-slate-500">표시할 거래가 없습니다.</p>
        ) : (
          pagedTransactions.map((transaction) => (
            <TransactionRow
              key={transaction.id}
              onEdit={onEdit}
              onRemove={onRemove}
              transaction={transaction}
            />
          ))
        )}
      </div>

      <div className="mt-3 flex flex-col items-center gap-2 text-center text-xs text-slate-500">
        <span>
          총 {totalCount}건 · {currentPage}/{totalPages} 페이지
        </span>
        <div className="flex gap-2">
          <button
            className="btn-small"
            disabled={currentPage === 1}
            type="button"
            onClick={() => onPageChange((value) => Math.max(1, value - 1))}
          >
            이전
          </button>
          <button
            className="btn-small"
            disabled={currentPage === totalPages}
            type="button"
            onClick={() => onPageChange((value) => Math.min(totalPages, value + 1))}
          >
            다음
          </button>
        </div>
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
  onRemove: (id: string) => void;
  transaction: Transaction;
}) {
  return (
    <article className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1.5 border-b border-slate-100 bg-white px-3 py-2 last:border-0">
      <div className="min-w-0">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-slate-950">
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black ${
              transaction.type === "income"
                ? "bg-slate-100 text-slate-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {transactionTypeLabel[transaction.type]}
          </span>
          <span className="truncate">{transaction.memo || "제목 없음"}</span>
        </p>
        <p className="mt-0.5 truncate text-[11px] text-slate-500">
          {transaction.category} · {paymentLabel[transaction.paymentMethod || "card"]} ·{" "}
          {inputterLabel[transaction.inputter || "husband"]} · {transaction.date}
        </p>
      </div>
      <p
        className={`money self-start text-right text-sm font-black ${
          transaction.type === "income" ? "text-slate-600" : "text-red-600"
        }`}
      >
        {currency.format(transaction.amount)}
      </p>
      <div className="col-span-2 flex justify-end gap-1.5">
        <button className="btn-small" type="button" onClick={() => onEdit(transaction.id)}>
          수정
        </button>
        <button className="btn-small-danger" type="button" onClick={() => onRemove(transaction.id)}>
          삭제
        </button>
      </div>
    </article>
  );
}

function DayPopup({
  day,
  onClose
}: {
  day: NonNullable<ReturnType<typeof buildDaySummary>>;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4 backdrop-blur-sm">
      <section className="panel max-h-[82vh] w-full max-w-md overflow-auto p-4">
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

        <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
          {day.transactions.length === 0 ? (
            <p className="p-5 text-center text-sm text-slate-500">해당 날짜의 거래가 없습니다.</p>
          ) : (
            day.transactions.map((transaction) => (
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
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
