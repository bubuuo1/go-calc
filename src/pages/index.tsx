import Head from "next/head";
import { useRouter } from "next/router";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import BottomNav from "@/components/BottomNav";
import ErrorBanner from "@/components/ErrorBanner";
import FeedbackToast from "@/components/FeedbackToast";
import { useAuth } from "@/contexts/AuthContext";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import {
  createTransaction,
  getCategories,
  getTransaction,
  getTransactions,
  OfflineMutationError,
  updateTransaction
} from "@/services/api";
import type {
  PaymentMethod,
  Transaction,
  TransactionInput,
  TransactionType
} from "@/types/transaction";
import {
  currentDateKey,
  currentMonthKey,
  isMonthKey,
  monthDateRange,
  shiftMonthKey
} from "@/utils/month";
import {
  clearStoredEditReturnPath,
  clearStoredEditTransactionId,
  getStoredEditReturnPath,
  getStoredEditTransactionId,
  getStoredMonth,
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

const emptyForm: TransactionInput = {
  type: "expense",
  paymentMethod: "card",
  inputter: "husband",
  category: "식비",
  amount: 0,
  memo: "",
  date: ""
};

const parseAmount = (value: string) => Number(value.replace(/[^\d]/g, ""));
const formatAmount = (value: number) => (value ? numberFormat.format(value) : "");
const isDateKey = (value: unknown): value is string => {
  if (typeof value !== "string") {
    return false;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    year >= 1000 &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
};

export default function Home() {
  const router = useRouter();
  const { membership } = useAuth();
  const selectedInputter = membership?.inputter || "husband";
  const formRef = useRef<HTMLFormElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const loadRequestRef = useRef(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [form, setForm] = useState<TransactionInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<{
    field: "memo" | "amount";
    message: string;
  } | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(currentMonthKey());
  const [pickerMonth, setPickerMonth] = useState(currentMonthKey());
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;

    try {
      const [nextTransactions, nextCategories] = await Promise.all([
        getTransactions(monthDateRange(visibleMonth)),
        getCategories()
      ]);

      if (requestId !== loadRequestRef.current) {
        return;
      }

      setTransactions(nextTransactions);
      setCategories(nextCategories.length > 0 ? nextCategories : DEFAULT_CATEGORIES);
      setErrorMessage(null);
      setIsLoading(false);
    } catch (error) {
      if (requestId !== loadRequestRef.current) {
        return;
      }

      console.error("가계부 데이터를 불러오지 못했습니다.", error);
      setErrorMessage("가계부 데이터를 불러오지 못했습니다. 연결을 확인해 주세요.");
      setIsLoading(false);
    }
  }, [visibleMonth]);

  useEffect(() => {
    setIsLoading(true);
    void load();
  }, [load]);

  useRefreshOnFocus(load);

  useEffect(() => {
    setForm((current) =>
      current.date ? current : { ...current, date: currentDateKey() }
    );
  }, []);

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    let active = true;

    const hydrateEditTransaction = async () => {
      const editId = getStoredEditTransactionId();
      if (!editId) {
        return;
      }

      try {
        const editTransaction = await getTransaction(editId);
        if (!active) {
          return;
        }

        if (!editTransaction) {
          clearStoredEditTransactionId();
          clearStoredEditReturnPath();
          setErrorMessage("수정할 거래를 찾을 수 없습니다.");
          return;
        }

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
      } catch (error) {
        if (!active) {
          return;
        }

        console.error("수정할 거래를 불러오지 못했습니다.", error);
        setErrorMessage("수정할 거래를 불러오지 못했습니다. 연결을 확인해 주세요.");
      }
    };

    void hydrateEditTransaction();

    return () => {
      active = false;
    };
  }, [router.isReady]);

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    const queryMonth = router.query.month;
    const queryDate = router.query.date;
    const nextMonth = isDateKey(queryDate)
      ? queryDate.slice(0, 7)
      : isMonthKey(queryMonth)
        ? queryMonth
        : getStoredMonth();
    setVisibleMonth(nextMonth);
    setPickerMonth(nextMonth);
    setStoredMonth(nextMonth);

    if (!getStoredEditTransactionId()) {
      setForm((current) => ({ ...current, inputter: selectedInputter }));
    }

    if (isDateKey(queryDate) && !getStoredEditTransactionId()) {
      setForm((current) => ({ ...current, date: queryDate }));
    }

    if (isMonthKey(queryMonth) || isDateKey(queryDate)) {
      void router.replace(router.pathname, undefined, { shallow: true });
    }
  }, [router.isReady, router.query.date, router.query.month, selectedInputter]);

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

  const recentTransactions = useMemo(() => transactions.slice(0, 3), [transactions]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const payload = {
      ...form,
      memo: form.memo.trim(),
      inputter: editingId ? form.inputter : selectedInputter,
      amount: Number(form.amount)
    };

    if (!payload.memo) {
      setValidationError({ field: "memo", message: "제목을 입력해 주세요." });
      titleInputRef.current?.focus();
      return;
    }

    if (!payload.amount || payload.amount < 0) {
      setValidationError({ field: "amount", message: "금액을 입력해 주세요." });
      amountInputRef.current?.focus();
      return;
    }

    try {
      setIsSaving(true);
      setValidationError(null);
      setErrorMessage(null);
      setSuccessMessage(null);
      if (editingId) {
        const returnPath = getStoredEditReturnPath();
        await updateTransaction(editingId, payload);
        setEditingId(null);
        clearStoredEditTransactionId();
        clearStoredEditReturnPath();
        setStoredMonth(payload.date.slice(0, 7));
        if (returnPath) {
          void router.replace({ pathname: returnPath, query: { updated: "1" } });
          return;
        }
        setSuccessMessage("거래를 수정했습니다.");
      } else {
        const created = await createTransaction(payload);
        setSuccessMessage(
          created.syncStatus === "pending"
            ? "오프라인에 저장했습니다. 연결되면 자동으로 동기화됩니다."
            : "거래를 저장했습니다."
        );
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
    } catch (error) {
      console.error("거래를 저장하지 못했습니다.", error);
      setErrorMessage(
        error instanceof OfflineMutationError
          ? error.message
          : "거래를 저장하지 못했습니다. 입력 내용은 유지되었습니다."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const reuseTransaction = (transaction: Transaction) => {
    const date = currentDateKey();
    setEditingId(null);
    clearStoredEditTransactionId();
    clearStoredEditReturnPath();
    setForm({
      type: transaction.type,
      paymentMethod: transaction.paymentMethod,
      inputter: selectedInputter,
      category: transaction.category,
      amount: transaction.amount,
      memo: transaction.memo,
      date
    });
    setVisibleMonth(date.slice(0, 7));
    setPickerMonth(date.slice(0, 7));
    setStoredMonth(date.slice(0, 7));
    setValidationError(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    titleInputRef.current?.focus();
  };

  return (
    <>
      <Head>
        <title>{membership?.household.name || "솔샘네"} 가계부</title>
        <meta name="description" content="Supabase 기반 가계부 입력 화면" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <ErrorBanner
        message={errorMessage}
        onDismiss={() => setErrorMessage(null)}
        onRetry={() => void load()}
      />

      <FeedbackToast
        message={successMessage}
        onDismiss={() => setSuccessMessage(null)}
        tone="success"
      />

      <main className="min-h-screen bg-slate-50 pb-28 text-slate-950">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
          <header className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black text-blue-600">{visibleMonth}</p>
              <h1 className="mt-0.5 text-xl font-black tracking-tight text-slate-950">
                {membership?.household.name || "솔샘네"} 가계부
              </h1>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-blue-100 bg-white py-1 pl-1 pr-3 shadow-sm">
              <img
                alt=""
                className="h-9 w-9 rounded-full border-2 border-white object-cover"
                src={selectedInputter === "husband" ? "/images/header-2.png" : "/images/header-3.png"}
              />
              <span className="text-xs font-black text-blue-700">
                {membership?.displayName || inputterLabel[selectedInputter]}
              </span>
            </div>
          </header>

          <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm shadow-blue-100/70">
            <div className="flex items-center justify-between bg-blue-600 px-4 py-3 text-white">
              <button
                aria-label="이전 달"
                className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-lg font-black hover:bg-white/20"
                type="button"
                onClick={() => {
                  const nextMonth = shiftMonthKey(visibleMonth, -1);
                  setVisibleMonth(nextMonth);
                  setPickerMonth(nextMonth);
                  setStoredMonth(nextMonth);
                }}
              >
                ‹
              </button>
              <strong className="text-base font-black">{visibleMonth.replace("-", "년 ") + "월"}</strong>
              <button
                aria-label="다음 달"
                className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-lg font-black hover:bg-white/20"
                type="button"
                onClick={() => {
                  const nextMonth = shiftMonthKey(visibleMonth, 1);
                  setVisibleMonth(nextMonth);
                  setPickerMonth(nextMonth);
                  setStoredMonth(nextMonth);
                }}
              >
                ›
              </button>
            </div>
            <div className="grid grid-cols-3 divide-x divide-slate-100 px-2 py-4">
              {[
                { label: "수입", value: monthlyStats.income, tone: "text-blue-600" },
                { label: "지출", value: monthlyStats.expense, tone: "text-red-600" },
                {
                  label: "잔액",
                  value: monthlyStats.balance,
                  tone: monthlyStats.balance < 0 ? "text-red-600" : "text-slate-950"
                }
              ].map((item) => (
                <div key={item.label} className="min-w-0 px-2 text-center">
                  <p className="text-xs font-bold text-slate-500">{item.label}</p>
                  {isLoading ? (
                    <div className="mx-auto mt-2 h-5 w-16 animate-pulse rounded bg-slate-100" />
                  ) : (
                    <p className={"money mt-1 truncate text-sm font-black sm:text-lg " + item.tone}>
                      {currency.format(item.value)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.12fr)_minmax(300px,0.88fr)]">
            <form
              ref={formRef}
              aria-busy={isSaving}
              className="panel scroll-mt-4 rounded-2xl p-4 sm:p-5"
              onSubmit={submit}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black">
                    {editingId ? "거래 수정" : "빠른 입력"}
                  </h2>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    {inputterLabel[selectedInputter]} 계정으로 입력 중
                  </p>
                </div>
                {editingId ? (
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">
                    수정 중
                  </span>
                ) : null}
              </div>

              <fieldset className="mt-4 grid gap-4" disabled={isSaving}>
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

                <label
                  className="grid gap-1.5 text-xs font-black text-slate-700"
                  htmlFor="transaction-title"
                >
                  제목
                  <input
                    ref={titleInputRef}
                    id="transaction-title"
                    aria-describedby={
                      validationError?.field === "memo" ? "transaction-title-error" : undefined
                    }
                    aria-invalid={validationError?.field === "memo"}
                    className="input"
                    value={form.memo}
                    onChange={(event) => {
                      const memo = event.target.value;
                      const category = inferCategory(memo, categories);
                      if (validationError?.field === "memo") {
                        setValidationError(null);
                      }
                      setForm((value) => ({
                        ...value,
                        memo,
                        category: category || value.category
                      }));
                    }}
                    placeholder="예: 이마트 장보기"
                  />
                  {validationError?.field === "memo" ? (
                    <span
                      id="transaction-title-error"
                      className="text-xs font-bold text-red-600"
                      role="alert"
                    >
                      {validationError.message}
                    </span>
                  ) : null}
                </label>

                <div className="grid gap-1.5">
                  <label
                    className="grid gap-1.5 text-xs font-black text-slate-700"
                    htmlFor="transaction-amount"
                  >
                    금액
                    <input
                      ref={amountInputRef}
                      id="transaction-amount"
                      aria-describedby={
                        validationError?.field === "amount"
                          ? "transaction-amount-error"
                          : undefined
                      }
                      aria-invalid={validationError?.field === "amount"}
                      className="input text-right"
                      inputMode="numeric"
                      value={formatAmount(form.amount)}
                      onChange={(event) => {
                        if (validationError?.field === "amount") {
                          setValidationError(null);
                        }
                        setForm((value) => ({
                          ...value,
                          amount: parseAmount(event.target.value)
                        }));
                      }}
                      placeholder="금액을 입력하세요"
                    />
                    {validationError?.field === "amount" ? (
                      <span
                        id="transaction-amount-error"
                        className="text-xs font-bold text-red-600"
                        role="alert"
                      >
                        {validationError.message}
                      </span>
                    ) : null}
                  </label>
                  <div
                    aria-label="금액 빠른 추가"
                    className="grid grid-cols-3 gap-2"
                    role="group"
                  >
                    {[1000, 10000, 50000].map((amount) => (
                      <button
                        key={amount}
                        className="btn-small border-blue-100 bg-blue-50 text-blue-700"
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            amount: current.amount + amount
                          }))
                        }
                      >
                        +{numberFormat.format(amount)}원
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-xs font-black text-slate-700">
                    날짜
                    <div className="relative grid grid-cols-[minmax(0,1fr)_44px] gap-2">
                      <input
                        className="input min-w-0 pr-2"
                        required
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
                        className="h-11 min-w-0 rounded-xl border border-blue-600 bg-blue-600 text-xs font-black text-white shadow-sm shadow-blue-100 transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
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

                  <label className="grid gap-1.5 text-xs font-black text-slate-700">
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
                  <button className="btn-primary h-11" type="submit">
                    {isSaving ? "저장 중..." : editingId ? "수정 저장" : "저장"}
                  </button>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      clearStoredEditTransactionId();
                      clearStoredEditReturnPath();
                      setForm({
                        ...emptyForm,
                        inputter: selectedInputter,
                        date: form.date,
                        category: categories[0] || "기타"
                      });
                      setValidationError(null);
                      setPickerMonth(form.date.slice(0, 7));
                      setIsPickerOpen(false);
                    }}
                  >
                    초기화
                  </button>
                </div>
              </fieldset>
            </form>

            <section aria-busy={isLoading} className="panel rounded-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black">최근 거래</h2>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    항목을 눌러 빠르게 다시 입력할 수 있어요.
                  </p>
                </div>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">
                  {transactions.length}건
                </span>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
                {isLoading ? (
                  <div className="grid gap-px bg-slate-100">
                    {[0, 1, 2].map((item) => (
                      <div key={item} className="h-[68px] animate-pulse bg-white p-3">
                        <div className="h-4 w-2/3 rounded bg-slate-100" />
                        <div className="mt-2 h-3 w-1/2 rounded bg-slate-100" />
                      </div>
                    ))}
                  </div>
                ) : recentTransactions.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <p className="text-sm font-black text-slate-700">아직 거래가 없습니다.</p>
                    <p className="mt-1 text-xs text-slate-500">첫 거래를 위에서 입력해 보세요.</p>
                  </div>
                ) : (
                  recentTransactions.map((transaction) => (
                    <button
                      key={transaction.id}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-slate-100 bg-white px-3 py-3 text-left transition last:border-0 hover:bg-blue-50/50"
                      type="button"
                      onClick={() => reuseTransaction(transaction)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-black text-slate-900">
                          {transaction.memo || "제목 없음"}
                        </span>
                        <span className="mt-1 block truncate text-xs text-slate-500">
                          {transaction.category} · {paymentLabel[transaction.paymentMethod]} ·{" "}
                          {inputterLabel[transaction.inputter]}
                        </span>
                      </span>
                      <span className="text-right">
                        <span
                          className={
                            transaction.type === "income"
                              ? "money block text-sm font-black text-blue-600"
                              : "money block text-sm font-black text-red-600"
                          }
                        >
                          {transaction.type === "income" ? "+" : "-"}
                          {currency.format(transaction.amount)}
                        </span>
                        <span className="mt-1 block text-[11px] font-bold text-blue-600">
                          다시 입력
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
        <BottomNav />
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
    <div className="grid grid-cols-2 gap-1.5 rounded-md bg-slate-50 p-1">
      {(["expense", "income"] as TransactionType[]).map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => onChange(type)}
          className={`h-11 rounded px-3 text-xs font-black transition ${
            value === type
              ? "border border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-200"
              : "border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"
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
          className={`h-11 rounded px-3 text-xs font-black transition ${
            value === method
              ? "border border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-200"
              : "border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"
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
            className={`h-11 rounded text-xs font-black transition ${
              day?.date === selectedDate
                ? "bg-blue-600 text-white shadow-sm shadow-blue-200"
                : day
                  ? "border border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-300 hover:bg-blue-50"
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
