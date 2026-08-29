import { describe, expect, it } from "vitest";
import type { Transaction } from "@/types/transaction";
import {
  DEFAULT_CATEGORIES,
  buildDaySummary,
  buildMonthDays,
  inferCategory
} from "./ledger";

const transaction = (
  id: string,
  type: Transaction["type"],
  amount: number,
  date: string
): Transaction => ({
  id,
  type,
  paymentMethod: "card",
  inputter: "husband",
  category: type === "income" ? "급여" : "식비",
  amount,
  memo: id,
  date
});

describe("가계부 분류", () => {
  it("제목의 키워드로 카테고리를 찾는다", () => {
    expect(inferCategory("주말 마트 장보기", DEFAULT_CATEGORIES)).toBe("식비");
    expect(inferCategory("월급 입금", DEFAULT_CATEGORIES)).toBe("급여");
  });

  it("사용 가능한 카테고리에 없으면 자동 분류하지 않는다", () => {
    expect(inferCategory("택시 이용", ["식비", "기타"])).toBeNull();
    expect(inferCategory("   ", DEFAULT_CATEGORIES)).toBeNull();
  });
});

describe("달력 집계", () => {
  it("윤년 2월의 29일을 모두 만든다", () => {
    const days = buildMonthDays("2024-02").filter(
      (day): day is NonNullable<typeof day> => Boolean(day)
    );

    expect(days).toHaveLength(29);
    expect(days[0]).toEqual({ date: "2024-02-01", dayNumber: 1 });
    expect(days.at(-1)).toEqual({ date: "2024-02-29", dayNumber: 29 });
  });

  it("선택 날짜의 수입과 지출만 합산한다", () => {
    const day = { date: "2026-08-29", dayNumber: 29 };
    const transactions = [
      transaction("income-1", "income", 100000, "2026-08-29"),
      transaction("expense-1", "expense", 30000, "2026-08-29"),
      transaction("expense-2", "expense", 5000, "2026-08-29"),
      transaction("other-day", "expense", 9999, "2026-08-28")
    ];

    expect(buildDaySummary(day, transactions)).toMatchObject({
      date: "2026-08-29",
      income: 100000,
      expense: 35000,
      transactions: transactions.slice(0, 3)
    });
  });
});
