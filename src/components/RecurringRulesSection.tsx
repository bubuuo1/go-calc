import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { ReactNode, RefObject } from "react";
import {
  createRecurringRule,
  deleteRecurringRule,
  getRecurringRules,
  updateRecurringRule
} from "@/services/recurring";
import type { RecurringRule, RecurringRuleInput } from "@/types/recurring";
import type { Inputter, PaymentMethod, TransactionType } from "@/types/transaction";
import {
  DEFAULT_CATEGORIES,
  inputterLabel,
  paymentLabel,
  transactionTypeLabel
} from "@/utils/ledger";

type RecurringRulesSectionProps = {
  currentInputter: Inputter;
};

type RecurringRuleForm = RecurringRuleInput;
type ValidationField =
  | "memo"
  | "category"
  | "amount"
  | "dayOfMonth"
  | "startDate"
  | "endDate";
type ValidationErrors = Partial<Record<ValidationField, string>>;

const currency = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0
});
const numberFormat = new Intl.NumberFormat("ko-KR");

const currentDateKey = () => {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0")
  ].join("-");
};

const makeEmptyForm = (inputter: Inputter): RecurringRuleForm => {
  const today = currentDateKey();
  return {
    type: "expense",
    paymentMethod: "card",
    inputter,
    category: "주거",
    amount: 0,
    memo: "",
    dayOfMonth: Number(today.slice(-2)),
    startDate: today,
    endDate: null,
    active: true
  };
};

const isDateKey = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
};

export const validateRecurringRule = (form: RecurringRuleForm): ValidationErrors => {
  const errors: ValidationErrors = {};
  if (!form.memo.trim()) errors.memo = "고정비 이름을 입력해 주세요.";
  if (!form.category.trim()) errors.category = "카테고리를 선택해 주세요.";
  if (!Number.isSafeInteger(form.amount) || form.amount <= 0) {
    errors.amount = "0원보다 큰 원 단위 금액을 입력해 주세요.";
  }
  if (!Number.isInteger(form.dayOfMonth) || form.dayOfMonth < 1 || form.dayOfMonth > 31) {
    errors.dayOfMonth = "반복일은 1일부터 31일 사이여야 합니다.";
  }
  if (!isDateKey(form.startDate)) errors.startDate = "시작일을 선택해 주세요.";
  if (form.endDate && !isDateKey(form.endDate)) {
    errors.endDate = "종료일을 올바르게 선택해 주세요.";
  } else if (form.endDate && form.endDate < form.startDate) {
    errors.endDate = "종료일은 시작일보다 빠를 수 없습니다.";
  }
  return errors;
};

const sortRules = (rules: RecurringRule[]) =>
  [...rules].sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1;
    if (left.dayOfMonth !== right.dayOfMonth) return left.dayOfMonth - right.dayOfMonth;
    return left.memo.localeCompare(right.memo, "ko");
  });

const formatDate = (value: string) => value.replace(/-/g, ".");
const parseAmount = (value: string) => Number(value.replace(/[^\d]/g, ""));
const friendlyError = (error: unknown, fallback: string) => {
  if (
    error instanceof Error &&
    ["로그인이 필요합니다.", "공유공간 설정을 먼저 완료해 주세요."].includes(error.message)
  ) {
    return error.message;
  }
  return fallback;
};

export default function RecurringRulesSection({
  currentInputter
}: RecurringRulesSectionProps) {
  const loadRequestRef = useRef(0);
  const memoInputRef = useRef<HTMLInputElement | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [form, setForm] = useState<RecurringRuleForm>(() => makeEmptyForm(currentInputter));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const activeCount = useMemo(() => rules.filter((rule) => rule.active).length, [rules]);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setIsLoading(true);
    try {
      const nextRules = await getRecurringRules();
      if (requestId !== loadRequestRef.current) return;
      setRules(sortRules(nextRules));
      setErrorMessage(null);
    } catch (error) {
      if (requestId !== loadRequestRef.current) return;
      console.error("반복 내역을 불러오지 못했습니다.", error);
      setErrorMessage(
        friendlyError(error, "반복 내역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.")
      );
    } finally {
      if (requestId === loadRequestRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      loadRequestRef.current += 1;
    };
  }, [load]);

  useEffect(() => {
    if (!editingId) setForm((current) => ({ ...current, inputter: currentInputter }));
  }, [currentInputter, editingId]);

  const closeForm = () => {
    setEditingId(null);
    setIsFormOpen(false);
    setForm(makeEmptyForm(currentInputter));
    setValidationErrors({});
  };

  const openNewForm = () => {
    setEditingId(null);
    setForm(makeEmptyForm(currentInputter));
    setValidationErrors({});
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsFormOpen(true);
    window.setTimeout(() => memoInputRef.current?.focus(), 0);
  };

  const openEditForm = (rule: RecurringRule) => {
    setEditingId(rule.id);
    setForm({
      type: rule.type,
      paymentMethod: rule.paymentMethod,
      inputter: rule.inputter,
      category: rule.category,
      amount: rule.amount,
      memo: rule.memo,
      dayOfMonth: rule.dayOfMonth,
      startDate: rule.startDate,
      endDate: rule.endDate,
      active: rule.active
    });
    setValidationErrors({});
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsFormOpen(true);
    window.setTimeout(() => memoInputRef.current?.focus(), 0);
  };

  const changeForm = (changes: Partial<RecurringRuleForm>) => {
    setForm((current) => ({ ...current, ...changes }));
    setValidationErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(changes) as Array<keyof RecurringRuleForm>) {
        if (key in next) delete next[key as ValidationField];
      }
      return next;
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = {
      ...form,
      category: form.category.trim(),
      memo: form.memo.trim(),
      amount: Number(form.amount)
    };
    const errors = validateRecurringRule(payload);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      if (errors.memo) memoInputRef.current?.focus();
      else if (errors.amount) amountInputRef.current?.focus();
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setValidationErrors({});
    try {
      if (editingId) {
        const updated = await updateRecurringRule(editingId, payload);
        setRules((current) =>
          sortRules(current.map((rule) => (rule.id === updated.id ? updated : rule)))
        );
        setSuccessMessage("반복 내역을 수정했습니다.");
      } else {
        const created = await createRecurringRule(payload);
        setRules((current) => sortRules([...current, created]));
        setSuccessMessage("반복 내역을 등록했습니다.");
      }
      closeForm();
    } catch (error) {
      console.error("반복 내역을 저장하지 못했습니다.", error);
      setErrorMessage(
        friendlyError(error, "반복 내역을 저장하지 못했습니다. 입력 내용은 그대로 두었습니다.")
      );
    } finally {
      setIsSaving(false);
    }
  };

  const toggleRule = async (rule: RecurringRule) => {
    setBusyAction(`toggle:${rule.id}`);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const updated = await updateRecurringRule(rule.id, { active: !rule.active });
      setRules((current) =>
        sortRules(current.map((item) => (item.id === updated.id ? updated : item)))
      );
      setSuccessMessage(updated.active ? "반복 등록을 다시 시작했습니다." : "반복 등록을 멈췄습니다.");
    } catch (error) {
      console.error("반복 상태를 바꾸지 못했습니다.", error);
      setErrorMessage("반복 상태를 바꾸지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusyAction(null);
    }
  };

  const removeRule = async (rule: RecurringRule) => {
    if (!window.confirm(`‘${rule.memo}’ 반복 내역을 삭제할까요?`)) return;
    setBusyAction(`delete:${rule.id}`);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await deleteRecurringRule(rule.id);
      setRules((current) => current.filter((item) => item.id !== rule.id));
      if (editingId === rule.id) closeForm();
      setSuccessMessage("반복 내역을 삭제했습니다.");
    } catch (error) {
      console.error("반복 내역을 삭제하지 못했습니다.", error);
      setErrorMessage("반복 내역을 삭제하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section aria-busy={isLoading} className="panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-gradient-to-br from-blue-50 to-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-200">
            <RepeatIcon />
          </span>
          <div>
            <h2 className="text-lg font-black text-slate-950">고정비 자동 등록</h2>
            <p className="mt-0.5 text-xs font-bold text-slate-500">
              매달 반복되는 수입·지출을 정한 날짜에 자동으로 기록해요.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-blue-700 shadow-sm ring-1 ring-blue-100">
            사용 중 {activeCount}개
          </span>
          <button className="btn-primary shrink-0 px-4" type="button" onClick={openNewForm}>
            + 새 반복
          </button>
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:p-5">
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs font-bold leading-5 text-blue-900">
          매월 29~31일을 선택했는데 그 날짜가 없는 달은, 해당 달의 마지막 날에 자동으로
          등록됩니다.
        </div>

        {errorMessage ? (
          <InlineNotice tone="error" onDismiss={() => setErrorMessage(null)}>
            <span className="min-w-0 flex-1">{errorMessage}</span>
            {rules.length === 0 ? (
              <button
                className="shrink-0 underline underline-offset-2"
                type="button"
                onClick={() => void load()}
              >
                다시 시도
              </button>
            ) : null}
          </InlineNotice>
        ) : null}

        {successMessage ? (
          <InlineNotice tone="success" onDismiss={() => setSuccessMessage(null)}>
            <span className="min-w-0 flex-1">{successMessage}</span>
          </InlineNotice>
        ) : null}

        {isFormOpen ? (
          <RuleForm
            amountInputRef={amountInputRef}
            editing={Boolean(editingId)}
            errors={validationErrors}
            form={form}
            isSaving={isSaving}
            memoInputRef={memoInputRef}
            onChange={changeForm}
            onClose={closeForm}
            onSubmit={submit}
          />
        ) : null}

        {isLoading ? (
          <div aria-label="반복 내역을 불러오는 중" className="grid gap-2">
            {[0, 1].map((item) => (
              <div
                key={item}
                className="h-28 animate-pulse rounded-2xl border border-slate-100 bg-slate-50"
              />
            ))}
          </div>
        ) : errorMessage && rules.length === 0 ? null : rules.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 px-4 py-10 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-blue-600 shadow-sm ring-1 ring-blue-100">
              <RepeatIcon />
            </span>
            <p className="mt-3 text-sm font-black text-slate-800">등록된 반복 내역이 없어요.</p>
            <p className="mt-1 text-xs font-bold text-slate-500">
              관리비, 보험료, 월급처럼 매달 같은 내역부터 등록해 보세요.
            </p>
            <button className="btn-primary mt-4 px-5" type="button" onClick={openNewForm}>
              첫 반복 만들기
            </button>
          </div>
        ) : (
          <div className="grid gap-2">
            {rules.map((rule) => (
              <RuleCard
                key={rule.id}
                busyAction={busyAction}
                rule={rule}
                onDelete={removeRule}
                onEdit={openEditForm}
                onToggle={toggleRule}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function InlineNotice({
  children,
  tone,
  onDismiss
}: {
  children: ReactNode;
  tone: "error" | "success";
  onDismiss: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold ${
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-blue-200 bg-blue-50 text-blue-900"
      }`}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
      <button
        aria-label={tone === "error" ? "오류 닫기" : "알림 닫기"}
        className="grid min-h-6 min-w-6 place-items-center text-lg leading-none"
        type="button"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}

function RuleForm({
  form,
  editing,
  errors,
  isSaving,
  memoInputRef,
  amountInputRef,
  onChange,
  onClose,
  onSubmit
}: {
  form: RecurringRuleForm;
  editing: boolean;
  errors: ValidationErrors;
  isSaving: boolean;
  memoInputRef: RefObject<HTMLInputElement>;
  amountInputRef: RefObject<HTMLInputElement>;
  onChange: (changes: Partial<RecurringRuleForm>) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4" onSubmit={onSubmit}>
      <fieldset
        aria-label={editing ? "반복 내역 수정" : "새 반복 내역"}
        className="grid gap-4"
        disabled={isSaving}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-slate-950">
              {editing ? "반복 내역 수정" : "새 반복 내역"}
            </h3>
            <p className="mt-1 text-xs font-bold text-slate-500">
              {inputterLabel[form.inputter]} 기록으로 자동 생성됩니다.
            </p>
          </div>
          <button
            aria-label="반복 내역 입력 닫기"
            className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-slate-200 bg-white text-xl text-slate-500 hover:bg-slate-50"
            type="button"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <SegmentedControl<TransactionType>
            label="거래 유형"
            options={[
              { value: "expense", label: "지출" },
              { value: "income", label: "수입" }
            ]}
            value={form.type}
            onChange={(type) => onChange({ type })}
          />
          <SegmentedControl<PaymentMethod>
            label="결제 수단"
            options={[
              { value: "card", label: "카드" },
              { value: "cash", label: "현금" }
            ]}
            value={form.paymentMethod}
            onChange={(paymentMethod) => onChange({ paymentMethod })}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="고정비 이름" error={errors.memo}>
            <input
              ref={memoInputRef}
              aria-invalid={Boolean(errors.memo)}
              className="input"
              maxLength={80}
              placeholder="예: 아파트 관리비"
              value={form.memo}
              onChange={(event) => onChange({ memo: event.target.value })}
            />
          </Field>
          <Field label="금액" error={errors.amount}>
            <input
              ref={amountInputRef}
              aria-invalid={Boolean(errors.amount)}
              className="input text-right tabular-nums"
              inputMode="numeric"
              placeholder="금액을 입력하세요"
              value={form.amount ? numberFormat.format(form.amount) : ""}
              onChange={(event) => onChange({ amount: parseAmount(event.target.value) })}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="카테고리" error={errors.category}>
            <select
              aria-invalid={Boolean(errors.category)}
              className="input"
              value={form.category}
              onChange={(event) => onChange({ category: event.target.value })}
            >
              {DEFAULT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </Field>
          <Field label="매월 반복일" error={errors.dayOfMonth}>
            <div className="relative">
              <input
                aria-invalid={Boolean(errors.dayOfMonth)}
                className="input pr-12 text-right tabular-nums"
                inputMode="numeric"
                max={31}
                min={1}
                type="number"
                value={form.dayOfMonth}
                onChange={(event) => onChange({ dayOfMonth: Number(event.target.value) })}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                일
              </span>
            </div>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="시작일" error={errors.startDate}>
            <input
              aria-invalid={Boolean(errors.startDate)}
              className="input"
              required
              type="date"
              value={form.startDate}
              onChange={(event) => onChange({ startDate: event.target.value })}
            />
          </Field>
          <Field label="종료일 (선택)" error={errors.endDate}>
            <input
              aria-invalid={Boolean(errors.endDate)}
              className="input"
              min={form.startDate}
              type="date"
              value={form.endDate || ""}
              onChange={(event) => onChange({ endDate: event.target.value || null })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary" type="submit">
            {isSaving ? "저장 중..." : editing ? "수정 저장" : "반복 등록"}
          </button>
          <button className="btn-secondary" type="button" onClick={onClose}>
            취소
          </button>
        </div>
      </fieldset>
    </form>
  );
}

function Field({
  label,
  error,
  children
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-black text-slate-700">
      {label}
      {children}
      {error ? (
        <span className="text-xs font-bold text-red-600" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-black text-slate-700">{label}</legend>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        {options.map((option) => (
          <button
            key={option.value}
            aria-pressed={value === option.value}
            className={`h-10 rounded-lg text-xs font-black transition ${
              value === option.value
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:text-blue-700"
            }`}
            type="button"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function RuleCard({
  rule,
  busyAction,
  onToggle,
  onEdit,
  onDelete
}: {
  rule: RecurringRule;
  busyAction: string | null;
  onToggle: (rule: RecurringRule) => Promise<void>;
  onEdit: (rule: RecurringRule) => void;
  onDelete: (rule: RecurringRule) => Promise<void>;
}) {
  const isToggling = busyAction === `toggle:${rule.id}`;
  const isDeleting = busyAction === `delete:${rule.id}`;
  const isBusy = isToggling || isDeleting;

  return (
    <article
      className={`rounded-2xl border p-3.5 transition sm:p-4 ${
        rule.active
          ? "border-slate-200 bg-white"
          : "border-slate-200 bg-slate-50 opacity-75"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-label={`매월 ${rule.dayOfMonth}일`}
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-black ${
            rule.type === "income" ? "bg-blue-100 text-blue-700" : "bg-red-50 text-red-600"
          }`}
        >
          {rule.dayOfMonth}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-black text-slate-950">{rule.memo}</h3>
              <p className="mt-1 text-xs font-bold text-slate-500">
                매월 {rule.dayOfMonth}일 · {rule.category} · {paymentLabel[rule.paymentMethod]}
              </p>
            </div>
            <strong
              className={`money text-sm ${
                rule.type === "income" ? "text-blue-600" : "text-red-600"
              }`}
            >
              {rule.type === "income" ? "+" : "-"}
              {currency.format(rule.amount)}
            </strong>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
              {inputterLabel[rule.inputter]} · {transactionTypeLabel[rule.type]}
            </span>
            {rule.active ? (
              <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">
                다음 등록 {formatDate(rule.nextDueDate)}
              </span>
            ) : (
              <span className="rounded-full bg-slate-200 px-2 py-1 text-slate-600">
                일시정지
              </span>
            )}
            {rule.dayOfMonth >= 29 ? (
              <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">
                짧은 달은 말일
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-[11px] font-bold text-slate-400">
            {formatDate(rule.startDate)}부터
            {rule.endDate ? ` ${formatDate(rule.endDate)}까지` : " 계속"}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
        <button
          aria-label={`${rule.memo} ${rule.active ? "반복 멈춤" : "반복 다시 시작"}`}
          aria-pressed={rule.active}
          className="btn-small"
          disabled={isBusy}
          type="button"
          onClick={() => void onToggle(rule)}
        >
          {isToggling ? "변경 중..." : rule.active ? "잠시 멈춤" : "다시 시작"}
        </button>
        <button
          aria-label={`${rule.memo} 수정`}
          className="btn-small"
          disabled={isBusy}
          type="button"
          onClick={() => onEdit(rule)}
        >
          수정
        </button>
        <button
          aria-label={`${rule.memo} 삭제`}
          className="btn-small-danger"
          disabled={isBusy}
          type="button"
          onClick={() => void onDelete(rule)}
        >
          {isDeleting ? "삭제 중..." : "삭제"}
        </button>
      </div>
    </article>
  );
}

function RepeatIcon() {
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
      <path d="m17 1 4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="m7 23-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}
