import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createTransaction,
  deleteTransaction,
  getCategories,
  getTransactions,
  updateTransaction
} from "@/services/api";
import type {
  PaymentMethod,
  Transaction,
  TransactionInput,
  TransactionType
} from "@/types/transaction";
import { currentMonthKey, isMonthKey, shiftMonthKey } from "@/utils/month";

const PAGE_SIZE = 8;

const currency = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0
});

const numberFormat = new Intl.NumberFormat("ko-KR");
const today = () => new Date().toISOString().slice(0, 10);

const emptyForm: TransactionInput = {
  type: "expense",
  paymentMethod: "card",
  category: "식비",
  amount: 0,
  memo: "",
  date: today()
};

const parseAmount = (value: string) => Number(value.replace(/[^\d]/g, ""));
const formatAmount = (value: number) => (value ? numberFormat.format(value) : "");

const paymentLabel: Record<PaymentMethod, string> = {
  cash: "현금",
  card: "카드"
};

const DEFAULT_CATEGORIES = [
  "식비",
  "교통",
  "쇼핑",
  "주거",
  "통신",
  "의료",
  "교육",
  "문화",
  "급여",
  "기타"
];

export default function Home() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [form, setForm] = useState<TransactionInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | TransactionType>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [visibleMonth, setVisibleMonth] = useState(currentMonthKey());
  const [pickerMonth, setPickerMonth] = useState(currentMonthKey());
  const [isPickerOpen, setIsPickerOpen] = useState(false);
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
    if (!router.isReady || !isMonthKey(router.query.month)) {
      return;
    }

    setVisibleMonth(router.query.month);
    setPickerMonth(router.query.month);
  }, [router.isReady, router.query.month]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const matchesQuery = `${transaction.memo} ${transaction.category} ${
        paymentLabel[transaction.paymentMethod] || ""
      }`
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

  const monthlyStats = useMemo(() => {
    const monthTransactions = transactions.filter((transaction) =>
      transaction.date.startsWith(visibleMonth)
    );
    const income = monthTransactions
      .filter((transaction) => transaction.type === "income")
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const expense = monthTransactions
      .filter((transaction) => transaction.type === "expense")
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    return { income, expense, balance: income - expense };
  }, [transactions, visibleMonth]);

  const calendarDays = useMemo(
    () => buildMonthDays(visibleMonth).map((day) => buildDaySummary(day, transactions)),
    [transactions, visibleMonth]
  );

  const changeMonth = (delta: number) => {
    const nextMonth = shiftMonth(visibleMonth, delta);
    setVisibleMonth(nextMonth);
    router.replace({ pathname: router.pathname, query: { ...router.query, month: nextMonth } }, undefined, {
      shallow: true
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const payload = {
      ...form,
      amount: Number(form.amount)
    };

    if (!payload.amount || payload.amount < 0) {
      return;
    }

    try {
      if (editingId) {
        await updateTransaction(editingId, payload);
        setEditingId(null);
      } else {
        await createTransaction(payload);
      }
      setForm({
        ...emptyForm,
        date: today(),
        category: categories[0] || "기타"
      });
      setPickerMonth(currentMonthKey());
      setIsPickerOpen(false);
      await load();
    } catch {}
  };

  const edit = (transaction: Transaction) => {
    setEditingId(transaction.id);
    setForm({
      type: transaction.type,
      paymentMethod: transaction.paymentMethod || "card",
      category: transaction.category,
      amount: transaction.amount,
      memo: transaction.memo,
      date: transaction.date
    });
    setPickerMonth(transaction.date.slice(0, 7));
    setIsPickerOpen(false);
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
        <title>고태윤 가계부</title>
        <meta name="description" content="JSON 파일 기반 로컬 가계부" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#3a0508,transparent_32%),linear-gradient(135deg,#070707,#191919_55%,#b5121b)] text-zinc-50">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-5 lg:px-6">
          <header className="flex flex-col gap-3 border-b border-red-500/40 pb-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-red-300">
                고태윤 가계부
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-normal text-white">
                수입 지출 관리
              </h1>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Link
                className="btn-secondary inline-flex h-9 items-center justify-center"
                href={{ pathname: "/totals", query: { month: visibleMonth } }}
              >
                전체 통계 보기
              </Link>
              <Link
                className="btn-secondary inline-flex h-9 items-center justify-center"
                href={{ pathname: "/stats", query: { month: visibleMonth } }}
              >
                일별 그래프 보기
              </Link>
            </div>
          </header>

          <section className="grid gap-3 md:grid-cols-3">
            <SummaryCard label={`${visibleMonth} 수입`} tone="income" value={monthlyStats.income} />
            <SummaryCard label={`${visibleMonth} 지출`} tone="expense" value={monthlyStats.expense} />
            <SummaryCard label={`${visibleMonth} 잔액`} tone="primary" value={monthlyStats.balance} />
          </section>

          <section className="grid gap-4 xl:grid-cols-[340px_1fr]">
            <form onSubmit={submit} className="panel p-3">
              <h2 className="text-base font-black">{editingId ? "거래 수정" : "거래 추가"}</h2>

              <div className="mt-3 grid gap-3">
                <SegmentedTransactionType
                  value={form.type}
                  onChange={(type) => setForm((current) => ({ ...current, type }))}
                />
                <SegmentedPaymentMethod
                  value={form.paymentMethod}
                  onChange={(paymentMethod) =>
                    setForm((current) => ({ ...current, paymentMethod }))
                  }
                />

                <label className="grid gap-1 text-xs font-bold">
                  금액
                  <input
                    className="input text-right"
                    inputMode="numeric"
                    value={formatAmount(form.amount)}
                    onChange={(event) =>
                      setForm((value) => ({
                        ...value,
                        amount: parseAmount(event.target.value)
                      }))
                    }
                    placeholder="금액을 입력하세요"
                  />
                </label>

                <div className="grid gap-2">
                  <label className="grid gap-1 text-xs font-bold">
                    카테고리
                    <select
                      className="input min-w-0"
                      value={form.category}
                      onChange={(event) =>
                        setForm((value) => ({ ...value, category: event.target.value }))
                      }
                    >
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1 text-xs font-bold">
                    날짜
                    <div className="relative grid grid-cols-[minmax(0,1fr)_42px] gap-1.5">
                      <input
                        className="input min-w-0 pr-2"
                        type="date"
                        value={form.date}
                        onChange={(event) => {
                          setForm((value) => ({ ...value, date: event.target.value }));
                          setPickerMonth(event.target.value.slice(0, 7));
                        }}
                      />
                      <button
                        aria-label="달력 열기"
                        className="h-9 min-w-0 rounded-md border border-red-900/70 bg-zinc-950 text-xs font-black text-red-200 hover:bg-red-950"
                        type="button"
                        onClick={() => setIsPickerOpen((value) => !value)}
                      >
                        달
                      </button>
                      {isPickerOpen ? (
                        <div className="absolute right-0 top-11 z-30 w-72">
                          <MiniDatePicker
                            month={pickerMonth}
                            selectedDate={form.date}
                            onMonthChange={setPickerMonth}
                            onSelect={(date) => {
                              setForm((value) => ({ ...value, date }));
                              setPickerMonth(date.slice(0, 7));
                              setIsPickerOpen(false);
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                  </label>
                </div>

                <label className="grid gap-1 text-xs font-bold">
                  메모
                  <input
                    className="input"
                    value={form.memo}
                    onChange={(event) =>
                      setForm((value) => ({ ...value, memo: event.target.value }))
                    }
                    placeholder="점심 식사"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button className="btn-primary" type="submit">
                    {editingId ? "수정 저장" : "추가"}
                  </button>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setForm({
                        ...emptyForm,
                        date: today(),
                        category: categories[0] || "기타"
                      });
                      setPickerMonth(currentMonthKey());
                      setIsPickerOpen(false);
                    }}
                  >
                    초기화
                  </button>
                </div>
              </div>
            </form>

            <div className="grid gap-4">
              <section className="panel p-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <h2 className="text-base font-black">월간 캘린더</h2>
                  <div className="flex items-center gap-2">
                    <button className="btn-small" type="button" onClick={() => changeMonth(-1)}>
                      이전
                    </button>
                    <strong className="min-w-24 text-center text-base">{visibleMonth}</strong>
                    <button className="btn-small" type="button" onClick={() => changeMonth(1)}>
                      다음
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-7 overflow-hidden rounded-md border border-red-900/60 bg-zinc-950">
                  {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                    <div
                      key={day}
                      className="border-b border-red-900/60 bg-black px-1 py-1.5 text-center text-[11px] font-black text-red-200"
                    >
                      {day}
                    </div>
                  ))}
                  {calendarDays.map((day, index) => (
                    <div
                      key={day?.date || `empty-${index}`}
                      className="min-h-16 border-b border-r border-red-900/50 p-1.5 last:border-r-0"
                    >
                      {day ? (
                        <>
                          <p className="text-xs font-black text-white">{day.dayNumber}</p>
                          <div className="mt-1 grid gap-0.5 text-[10px] font-bold leading-tight">
                            <span className="text-emerald-300">
                              + {day.income ? compactWon(day.income) : "0"}
                            </span>
                            <span className="text-red-300">
                              - {day.expense ? compactWon(day.expense) : "0"}
                            </span>
                          </div>
                        </>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>

              <section className="panel p-3">
                <div className="grid gap-2 md:grid-cols-[1fr_120px_140px]">
                  <input
                    className="input"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="메모, 카테고리, 결제수단 검색"
                  />
                  <select
                    className="input"
                    value={typeFilter}
                    onChange={(event) =>
                      setTypeFilter(event.target.value as "all" | TransactionType)
                    }
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

                <div className="mt-3 overflow-hidden rounded-md border border-red-900/60">
                  {pagedTransactions.length === 0 ? (
                    <p className="p-5 text-center text-sm text-zinc-400">
                      표시할 거래가 없습니다.
                    </p>
                  ) : (
                    pagedTransactions.map((transaction) => (
                      <article
                        key={transaction.id}
                        className="grid gap-2 border-b border-red-900/50 bg-zinc-950/70 px-3 py-2.5 last:border-0 md:grid-cols-[70px_1fr_130px_105px]"
                      >
                        <div>
                          <span
                            className={`rounded px-2 py-1 text-[11px] font-black ${
                              transaction.type === "income"
                                ? "bg-emerald-950 text-emerald-300"
                                : "bg-red-950 text-red-300"
                            }`}
                          >
                            {transaction.type === "income" ? "수입" : "지출"}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">
                            {transaction.memo || "메모 없음"}
                          </p>
                          <p className="mt-0.5 text-xs text-zinc-400">
                            {transaction.category} ·{" "}
                            {paymentLabel[transaction.paymentMethod || "card"]} ·{" "}
                            {transaction.date}
                          </p>
                        </div>
                        <p
                          className={`text-sm font-black ${
                            transaction.type === "income"
                              ? "text-emerald-300"
                              : "text-red-300"
                          }`}
                        >
                          {currency.format(transaction.amount)}
                        </p>
                        <div className="flex gap-1.5 md:justify-end">
                          <button
                            className="btn-small"
                            type="button"
                            onClick={() => edit(transaction)}
                          >
                            수정
                          </button>
                          <button
                            className="btn-small-danger"
                            type="button"
                            onClick={() => remove(transaction.id)}
                          >
                            삭제
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>

                <div className="mt-3 flex flex-col gap-2 text-xs text-zinc-300 sm:flex-row sm:items-center sm:justify-between">
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
          </section>
        </div>
      </main>
    </>
  );
}

function SegmentedTransactionType({
  value,
  onChange
}: {
  value: TransactionType;
  onChange: (type: TransactionType) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5 rounded-md bg-zinc-950 p-1">
      {(["expense", "income"] as TransactionType[]).map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => onChange(type)}
          className={`rounded px-3 py-1.5 text-xs font-black ${
            value === type ? "bg-red-700 text-white shadow-sm" : "text-zinc-400"
          }`}
        >
          {type === "expense" ? "지출" : "소득"}
        </button>
      ))}
    </div>
  );
}

function SegmentedPaymentMethod({
  value,
  onChange
}: {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5 rounded-md bg-zinc-950 p-1">
      {(["card", "cash"] as PaymentMethod[]).map((method) => (
        <button
          key={method}
          type="button"
          onClick={() => onChange(method)}
          className={`rounded px-3 py-1.5 text-xs font-black ${
            value === method ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-400"
          }`}
        >
          {paymentLabel[method]}
        </button>
      ))}
    </div>
  );
}

function MiniDatePicker({
  month,
  selectedDate,
  onMonthChange,
  onSelect
}: {
  month: string;
  selectedDate: string;
  onMonthChange: (month: string) => void;
  onSelect: (date: string) => void;
}) {
  const days = buildMonthDays(month);

  return (
    <div className="rounded-md border border-red-900/70 bg-zinc-950 p-3 shadow-2xl shadow-black">
      <div className="mb-2 flex items-center justify-between">
        <button className="btn-small" type="button" onClick={() => onMonthChange(shiftMonth(month, -1))}>
          이전
        </button>
        <strong className="text-sm">{month}</strong>
        <button className="btn-small" type="button" onClick={() => onMonthChange(shiftMonth(month, 1))}>
          다음
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
          <span key={day} className="py-1 font-black text-red-200">
            {day}
          </span>
        ))}
        {days.map((day, index) => (
          <button
            key={day?.date || `empty-picker-${index}`}
            className={`h-7 rounded text-xs font-black ${
              day?.date === selectedDate
                ? "bg-red-700 text-white"
                : day
                  ? "bg-black text-zinc-200 hover:bg-red-950"
                  : "bg-transparent"
            }`}
            disabled={!day}
            type="button"
            onClick={() => day && onSelect(day.date)}
          >
            {day?.dayNumber || ""}
          </button>
        ))}
      </div>
    </div>
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
    income: "text-emerald-300",
    expense: "text-red-300",
    primary: "text-white"
  }[tone];

  return (
    <div className="panel p-3">
      <p className="text-xs font-bold text-zinc-400">{label}</p>
      <p className={`mt-1 text-xl font-black ${toneClass}`}>{currency.format(value)}</p>
    </div>
  );
}

function buildMonthDays(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const prefixDays = firstDay.getDay();
  const totalSlots = Math.ceil((prefixDays + lastDay.getDate()) / 7) * 7;

  return Array.from({ length: totalSlots }, (_, index) => {
    const dayNumber = index - prefixDays + 1;
    if (dayNumber < 1 || dayNumber > lastDay.getDate()) {
      return null;
    }

    return {
      date: `${monthKey}-${String(dayNumber).padStart(2, "0")}`,
      dayNumber
    };
  });
}

function buildDaySummary(
  day: ReturnType<typeof buildMonthDays>[number],
  transactions: Transaction[]
) {
  if (!day) {
    return null;
  }

  const dayTransactions = transactions.filter((transaction) => transaction.date === day.date);
  const income = dayTransactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const expense = dayTransactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  return { ...day, income, expense };
}

function compactWon(value: number) {
  if (value >= 10000) {
    const manWon = value / 10000;
    const displayValue = Number.isInteger(manWon) ? manWon.toFixed(0) : manWon.toFixed(1);
    return `${displayValue}만`;
  }

  return numberFormat.format(value);
}

function shiftMonth(monthKey: string, delta: number) {
  return shiftMonthKey(monthKey, delta);
}
