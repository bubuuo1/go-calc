export const toMonthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const koreaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export const toKoreaDateKey = (date: Date) => {
  const parts = koreaDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("한국 날짜를 계산하지 못했습니다.");
  }

  return `${year}-${month}-${day}`;
};

export const currentDateKey = () => toKoreaDateKey(new Date());

export const currentMonthKey = () => currentDateKey().slice(0, 7);

export const isMonthKey = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}$/.test(value);

export const shiftMonthKey = (monthKey: string, delta: number) => {
  const [year, month] = monthKey.split("-").map(Number);
  return toMonthKey(new Date(year, month - 1 + delta, 1));
};

export type TransactionDateRange = {
  startDate: string;
  endDateExclusive: string;
};

export const monthDateRange = (monthKey: string): TransactionDateRange => ({
  startDate: `${monthKey}-01`,
  endDateExclusive: `${shiftMonthKey(monthKey, 1)}-01`
});

export const monthWithPreviousDateRange = (
  monthKey: string
): TransactionDateRange => ({
  startDate: `${shiftMonthKey(monthKey, -1)}-01`,
  endDateExclusive: `${shiftMonthKey(monthKey, 1)}-01`
});

export const yearDateRange = (year: string): TransactionDateRange => ({
  startDate: `${year}-01-01`,
  endDateExclusive: `${Number(year) + 1}-01-01`
});
