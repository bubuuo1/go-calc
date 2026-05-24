import type { Inputter, PaymentMethod, Transaction, TransactionType } from "@/types/transaction";

export const DEFAULT_CATEGORIES = [
  "식비",
  "교통",
  "쇼핑",
  "주거",
  "통신",
  "의료",
  "교육",
  "문화",
  "급여",
  "적금",
  "보험",
  "경조사",
  "기타"
];

export const EXCLUDED_GRAPH_CATEGORIES = ["적금", "보험", "경조사"];

export const paymentLabel: Record<PaymentMethod, string> = {
  cash: "현금",
  card: "카드"
};

export const inputterLabel: Record<Inputter, string> = {
  husband: "남편",
  wife: "아내"
};

export const transactionTypeLabel: Record<TransactionType, string> = {
  income: "수입",
  expense: "지출"
};

export const inferCategory = (title: string, categories: string[]) => {
  const text = title.trim().toLowerCase();

  const rules = [
    { category: "적금", keywords: ["적금", "저축", "예금", "청약"] },
    { category: "보험", keywords: ["보험", "실비", "자동차보험", "화재"] },
    { category: "경조사", keywords: ["경조사", "축의", "부의", "조의", "결혼", "장례"] },
    { category: "식비", keywords: ["식사", "점심", "저녁", "아침", "커피", "마트", "배달"] },
    { category: "교통", keywords: ["교통", "택시", "버스", "지하철", "주유", "기름"] },
    { category: "쇼핑", keywords: ["쇼핑", "쿠팡", "옷", "의류", "신발"] },
    { category: "주거", keywords: ["월세", "관리비", "전기", "가스", "수도"] },
    { category: "통신", keywords: ["통신", "휴대폰", "인터넷", "요금"] },
    { category: "의료", keywords: ["병원", "약국", "의료", "진료"] },
    { category: "교육", keywords: ["학원", "교육", "수업", "교재"] },
    { category: "문화", keywords: ["영화", "공연", "도서", "여행", "구독"] },
    { category: "급여", keywords: ["급여", "월급", "상여", "보너스"] }
  ];

  return (
    rules.find(
      (rule) => categories.includes(rule.category) && rule.keywords.some((keyword) => text.includes(keyword))
    )?.category || null
  );
};

export const buildMonthDays = (monthKey: string) => {
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
};

export const buildDaySummary = (
  day: ReturnType<typeof buildMonthDays>[number],
  transactions: Transaction[]
) => {
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

  return { ...day, income, expense, transactions: dayTransactions };
};

export const compactWon = (value: number) => {
  const numberFormat = new Intl.NumberFormat("ko-KR");

  if (value >= 10000) {
    const manWon = value / 10000;
    const displayValue = Number.isInteger(manWon) ? manWon.toFixed(0) : manWon.toFixed(1);
    return `${displayValue}만`;
  }

  return numberFormat.format(value);
};
