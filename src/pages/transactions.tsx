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

const PAGE_SIZE = 5;

const currency = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0
});

export default function TransactionsPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [month, setMonth] = useState(currentMonthKey());
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
    setMonth(nextMonth || currentMonthKey());
    setStoredMonth(nextMonth || currentMonthKey());

    if (isMonthKey(queryMonth)) {
      router.replace(router.pathname, undefined, { shallow: true });
    }
  }, [router.isReady, router.query.month]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const matchesMonth = transaction.date.startsWith(month);
      const matchesQuery = `${transaction.memo} ${transaction.category} ${
        paymentLabel[transaction.paymentMethod] || ""
      } ${inputterLabel[transaction.inputter || "husband"] || ""}`
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesType = typeFilter === "all" || transaction.type === typeFilter;
      const matchesCategory =
        categoryFilter === "all" || transaction.category === categoryFilter;

      return matchesMonth && matchesQuery && matchesType && matchesCategory;
    });
  }, [categoryFilter, month, query, transactions, typeFilter]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, month, query, typeFilter]);

  const shiftMonth = (delta: number) => {
    const nextMonth = shiftMonthKey(month, delta);
    setMonth(nextMonth);
    setStoredMonth(nextMonth);
  };

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedTransactions = filteredTransactions.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const edit = (id: string) => {
    setStoredEditTransactionId(id);
    setStoredEditReturnPath("/transactions");
    router.replace("/");
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
        <title>거래리스트 | 솔샘네 가계부</title>
        <meta name="description" content="거래리스트" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="min-h-screen bg-slate-50 text-slate-950">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-4 sm:px-5 lg:px-6">
          <header className="border-b border-slate-200 pb-3">
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

          <section className="panel p-3">
            <div className="grid gap-2 md:grid-cols-[1fr_120px_140px]">
              <input
                className="input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="제목, 카테고리, 결제수단 검색"
              />
              <select
                className="input"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as "all" | TransactionType)}
              >
                <option value="all">전체 유형</option>
                <option value="income">수입</option>
                <option value="expense">지출</option>
              </select>
              <select
                className="input"
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
            </div>

            <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
              {pagedTransactions.length === 0 ? (
                <p className="p-5 text-center text-sm text-slate-500">표시할 거래가 없습니다.</p>
              ) : (
                pagedTransactions.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    onEdit={edit}
                    onRemove={remove}
                    transaction={transaction}
                  />
                ))
              )}
            </div>

            <div className="mt-3 flex flex-col items-center gap-2 text-center text-xs text-slate-500">
              <span>
                총 {filteredTransactions.length}건 · {currentPage}/{totalPages} 페이지
              </span>
              <div className="flex gap-2">
                <button
                  className="btn-small"
                  disabled={currentPage === 1}
                  type="button"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  이전
                </button>
                <button
                  className="btn-small"
                  disabled={currentPage === totalPages}
                  type="button"
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                >
                  다음
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
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
    <article className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1.5 border-b border-slate-100 bg-white px-3 py-2 last:border-0 md:grid-cols-[70px_1fr_130px_105px] md:gap-2 md:py-2.5">
      <div className="hidden md:block">
        <span
          className={`rounded px-2 py-1 text-[11px] font-black ${
            transaction.type === "income"
              ? "bg-slate-100 text-slate-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {transactionTypeLabel[transaction.type]}
        </span>
      </div>
      <div className="min-w-0">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-slate-950">
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black md:hidden ${
              transaction.type === "income"
                ? "bg-slate-100 text-slate-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {transactionTypeLabel[transaction.type]}
          </span>
          <span className="truncate">{transaction.memo || "제목 없음"}</span>
        </p>
        <p className="mt-0.5 truncate text-[11px] text-slate-500 sm:text-xs">
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
      <div className="col-span-2 flex justify-end gap-1.5 md:col-auto md:justify-end">
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
