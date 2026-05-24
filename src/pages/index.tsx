import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createTransaction,
  getCategories,
  getTransactions,
  updateTransaction
} from "@/services/api";
import type {
  Inputter,
  PaymentMethod,
  Transaction,
  TransactionInput,
  TransactionType
} from "@/types/transaction";
import { currentMonthKey, isMonthKey, shiftMonthKey } from "@/utils/month";
import {
  clearStoredEditTransactionId,
  getStoredEditTransactionId,
  getStoredInputter,
  getStoredMonth,
  markAppEntered,
  setStoredInputter,
  setStoredMonth
} from "@/utils/session";
import {
  DEFAULT_CATEGORIES,
  inferCategory,
  inputterLabel,
  paymentLabel
} from "@/utils/ledger";

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
  inputter: "husband",
  category: "식비",
  amount: 0,
  memo: "",
  date: today()
};

const parseAmount = (value: string) => Number(value.replace(/[^\d]/g, ""));
const formatAmount = (value: number) => (value ? numberFormat.format(value) : "");

export default function Home() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [form, setForm] = useState<TransactionInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedInputter, setSelectedInputter] = useState<Inputter | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(currentMonthKey());
  const [pickerMonth, setPickerMonth] = useState(currentMonthKey());
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const load = async () => {
    try {
      const [nextTransactions, nextCategories] = await Promise.all([
        getTransactions(),
        getCategories()
      ]);
      setTransactions(nextTransactions);
      setCategories(nextCategories.length > 0 ? nextCategories : DEFAULT_CATEGORIES);

      const editId = getStoredEditTransactionId();
      const editTransaction = nextTransactions.find((transaction) => transaction.id === editId);
      if (editTransaction) {
        setEditingId(editTransaction.id);
        setForm({
          type: editTransaction.type,
          paymentMethod: editTransaction.paymentMethod || "card",
          inputter: editTransaction.inputter || "husband",
          category: editTransaction.category,
          amount: editTransaction.amount,
          memo: editTransaction.memo,
          date: editTransaction.date
        });
        setPickerMonth(editTransaction.date.slice(0, 7));
        setVisibleMonth(editTransaction.date.slice(0, 7));
      }
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

    markAppEntered();
    const queryMonth = router.query.month;
    const nextMonth = isMonthKey(queryMonth) ? queryMonth : getStoredMonth();
    const storedInputter = getStoredInputter();
    setVisibleMonth(nextMonth);
    setPickerMonth(nextMonth);
    setStoredMonth(nextMonth);
    setSelectedInputter(storedInputter);

    if (storedInputter) {
      setForm((current) => ({ ...current, inputter: storedInputter }));
    }

    if (isMonthKey(queryMonth)) {
      router.replace(router.pathname, undefined, { shallow: true });
    }
  }, [router.isReady, router.query.month]);

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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const payload = {
      ...form,
      inputter: editingId ? form.inputter : selectedInputter || form.inputter,
      amount: Number(form.amount)
    };

    if (!selectedInputter || !payload.amount || payload.amount < 0) {
      return;
    }

    try {
      if (editingId) {
        await updateTransaction(editingId, payload);
        setEditingId(null);
        clearStoredEditTransactionId();
      } else {
        await createTransaction(payload);
      }
      setForm({
        ...emptyForm,
        inputter: selectedInputter,
        date: form.date,
        category: categories[0] || "기타"
      });
      setPickerMonth(form.date.slice(0, 7));
      setIsPickerOpen(false);
      await load();
    } catch {}
  };

  const chooseInputter = (inputter: Inputter) => {
    setSelectedInputter(inputter);
    setStoredInputter(inputter);
    setForm((current) => ({ ...current, inputter }));
  };

  return (
    <>
      <Head>
        <title>고태윤 가계부</title>
        <meta name="description" content="Supabase 기반 가계부 입력 화면" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="min-h-screen bg-slate-50 text-slate-950">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-5 lg:px-6">
          <header className="order-1 flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                고태윤 가계부
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-normal text-slate-950">
                수입 지출 관리
              </h1>
            </div>
            <div className="hidden flex-col gap-2 sm:flex sm:flex-row sm:items-end">
              <Link
                className="btn-secondary inline-flex h-9 items-center justify-center"
                href="/totals"
                replace
              >
                전체 통계 보기
              </Link>
              <Link
                className="btn-secondary inline-flex h-9 items-center justify-center"
                href="/stats"
                replace
              >
                일별 그래프 보기
              </Link>
            </div>
          </header>

          <section className="order-3 grid gap-3 sm:order-2 md:grid-cols-3">
            <SummaryCard label={`${visibleMonth} 수입`} tone="income" value={monthlyStats.income} />
            <SummaryCard label={`${visibleMonth} 지출`} tone="expense" value={monthlyStats.expense} />
            <SummaryCard label={`${visibleMonth} 잔액`} tone="primary" value={monthlyStats.balance} />
          </section>

          <section className="order-2 sm:order-3">
            <form onSubmit={submit} className="panel mx-auto max-w-xl p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-black">{editingId ? "가계부 수정" : "가계부"}</h2>
                  <p className="mt-0.5 text-xs font-bold text-slate-500">
                    {selectedInputter ? `${inputterLabel[selectedInputter]} 입력 중` : "입력자를 선택해 주세요"}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <IconNav href="/ledger" label="달력/리스트" type="ledger" />
                  <IconNav href="/totals" label="전체통계" type="totals" />
                  <IconNav href="/stats" label="그래프" type="stats" />
                </div>
              </div>

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
                  제목
                  <input
                    className="input"
                    value={form.memo}
                    onChange={(event) => {
                      const memo = event.target.value;
                      const category = inferCategory(memo, categories);
                      setForm((value) => ({
                        ...value,
                        memo,
                        category: category || value.category
                      }));
                    }}
                    placeholder="점심 식사"
                  />
                </label>

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
                    날짜
                    <div className="relative grid grid-cols-[minmax(0,1fr)_42px] gap-1.5">
                      <input
                        className="input min-w-0 pr-2"
                        type="date"
                        value={form.date}
                        onChange={(event) => {
                          setForm((value) => ({ ...value, date: event.target.value }));
                          setPickerMonth(event.target.value.slice(0, 7));
                          setVisibleMonth(event.target.value.slice(0, 7));
                          setStoredMonth(event.target.value.slice(0, 7));
                        }}
                      />
                      <button
                        aria-label="달력 열기"
                        className="h-9 min-w-0 rounded-md border border-slate-500 bg-slate-500 text-xs font-black text-white shadow-sm shadow-slate-200 transition hover:bg-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500/20"
                        type="button"
                        onClick={() => setIsPickerOpen((value) => !value)}
                      >
                        <svg
                          aria-hidden="true"
                          className="mx-auto h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          viewBox="0 0 24 24"
                        >
                          <path d="M8 2v4" />
                          <path d="M16 2v4" />
                          <rect height="18" rx="3" width="18" x="3" y="4" />
                          <path d="M3 10h18" />
                          <path d="M8 14h.01" />
                          <path d="M12 14h.01" />
                          <path d="M16 14h.01" />
                          <path d="M8 18h.01" />
                          <path d="M12 18h.01" />
                        </svg>
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
                              setVisibleMonth(date.slice(0, 7));
                              setStoredMonth(date.slice(0, 7));
                              setIsPickerOpen(false);
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                  </label>

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
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button className="btn-primary" type="submit">
                    {editingId ? "수정 저장" : "추가"}
                  </button>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      clearStoredEditTransactionId();
                      setForm({
                        ...emptyForm,
                        inputter: selectedInputter || "husband",
                        date: form.date,
                        category: categories[0] || "기타"
                      });
                      setPickerMonth(form.date.slice(0, 7));
                      setIsPickerOpen(false);
                    }}
                  >
                    초기화
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
        {!selectedInputter ? <InputterGate onSelect={chooseInputter} /> : null}
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
  type: "ledger" | "totals" | "stats";
}) {
  return (
    <Link
      aria-label={label}
      className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-400 hover:text-slate-950"
      href={href}
      replace
      title={label}
    >
      {type === "ledger" ? (
        <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M8 2v4" />
          <path d="M16 2v4" />
          <rect height="18" rx="3" width="18" x="3" y="4" />
          <path d="M3 10h18" />
          <path d="M7 14h4" />
          <path d="M7 18h7" />
        </svg>
      ) : null}
      {type === "totals" ? (
        <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M4 19V5" />
          <path d="M4 19h16" />
          <path d="M8 16v-5" />
          <path d="M12 16V8" />
          <path d="M16 16v-3" />
        </svg>
      ) : null}
      {type === "stats" ? (
        <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M4 19h16" />
          <path d="M4 15l4-4 4 3 5-7 3 4" />
        </svg>
      ) : null}
    </Link>
  );
}

function InputterGate({ onSelect }: { onSelect: (inputter: Inputter) => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4 backdrop-blur-sm">
      <section className="panel w-full max-w-sm p-5 text-center">
        <p className="text-sm font-bold text-slate-500">처음 사용할 입력자를 선택해 주세요</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950">누가 입력하나요?</h2>
        <div className="mt-5 grid grid-cols-2 gap-2">
          {(["husband", "wife"] as Inputter[]).map((inputter) => (
            <button
              key={inputter}
              className="btn-primary h-12"
              type="button"
              onClick={() => onSelect(inputter)}
            >
              {inputterLabel[inputter]}
            </button>
          ))}
        </div>
      </section>
    </div>
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
    <div className="grid grid-cols-2 gap-1.5 rounded-md bg-slate-50 p-1">
      {(["expense", "income"] as TransactionType[]).map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => onChange(type)}
          className={`rounded px-3 py-1.5 text-xs font-black ${
            value === type
              ? "border border-slate-500 bg-slate-500 text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-600"
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
    <div className="grid grid-cols-2 gap-1.5 rounded-md bg-slate-50 p-1">
      {(["card", "cash"] as PaymentMethod[]).map((method) => (
        <button
          key={method}
          type="button"
          onClick={() => onChange(method)}
          className={`rounded px-3 py-1.5 text-xs font-black ${
            value === method
              ? "border border-slate-500 bg-slate-500 text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-600"
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
    <div className="rounded-md border border-slate-200 bg-white p-3 shadow-xl shadow-slate-200/80">
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
          <span key={day} className="py-1 font-black text-slate-600">
            {day}
          </span>
        ))}
        {days.map((day, index) => (
          <button
            key={day?.date || `empty-picker-${index}`}
            className={`h-7 rounded text-xs font-black ${
              day?.date === selectedDate
                ? "bg-slate-500 text-white"
                : day
                  ? "border border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-400 hover:bg-white"
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
    income: "text-slate-600",
    expense: "text-red-600",
    primary: "text-slate-950"
  }[tone];

  return (
    <div className="panel p-3">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className={`money mt-1 text-lg font-black sm:text-xl ${toneClass}`}>
        {currency.format(value)}
      </p>
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

function shiftMonth(monthKey: string, delta: number) {
  return shiftMonthKey(monthKey, delta);
}
