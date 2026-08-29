import { describe, expect, it, vi } from "vitest";
import type { RecurringRuleInput } from "@/types/recurring";

vi.mock("@/services/recurring", () => ({
  createRecurringRule: vi.fn(),
  deleteRecurringRule: vi.fn(),
  getRecurringRules: vi.fn(),
  updateRecurringRule: vi.fn()
}));

import { validateRecurringRule } from "./RecurringRulesSection";

const validRule: RecurringRuleInput = {
  type: "expense",
  paymentMethod: "card",
  inputter: "husband",
  category: "주거",
  amount: 150000,
  memo: "관리비",
  dayOfMonth: 31,
  startDate: "2026-08-01",
  endDate: null,
  active: true
};

describe("validateRecurringRule", () => {
  it("1~31일의 정상적인 반복 규칙을 허용한다", () => {
    expect(validateRecurringRule(validRule)).toEqual({});
  });

  it("빈 이름·0원·범위를 벗어난 반복일을 함께 안내한다", () => {
    const errors = validateRecurringRule({
      ...validRule,
      memo: " ",
      amount: 0,
      dayOfMonth: 32
    });

    expect(errors).toMatchObject({
      memo: expect.any(String),
      amount: expect.any(String),
      dayOfMonth: expect.any(String)
    });
  });

  it("종료일이 시작일보다 빠르면 거부한다", () => {
    expect(
      validateRecurringRule({
        ...validRule,
        startDate: "2026-08-10",
        endDate: "2026-08-09"
      }).endDate
    ).toBe("종료일은 시작일보다 빠를 수 없습니다.");
  });
});
