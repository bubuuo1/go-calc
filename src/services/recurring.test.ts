import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSupabaseClientMock } = vi.hoisted(() => ({
  getSupabaseClientMock: vi.fn()
}));

vi.mock("@/services/supabase", () => ({
  getSupabaseClient: getSupabaseClientMock
}));

const row = {
  id: "rule-1",
  household_id: "household-1",
  type: "expense",
  payment_method: "card",
  inputter: "husband",
  category: "주거",
  amount: "150000",
  memo: "관리비",
  day_of_month: 31,
  start_date: "2026-08-01",
  end_date: null,
  next_due_date: "2026-08-31",
  active: true,
  created_by: "user-1",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z"
};

const makeQuery = (result: { data: unknown; error: unknown }) => {
  const query = {} as Record<string, ReturnType<typeof vi.fn>>;
  for (const method of ["select", "order", "eq", "insert", "update", "delete"]) {
    query[method] = vi.fn(() => query);
  }
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  query.single = vi.fn().mockResolvedValue(result);
  query.then = vi.fn((resolve) => Promise.resolve(result).then(resolve));
  return query;
};

beforeEach(() => {
  vi.resetModules();
  getSupabaseClientMock.mockReset();
});

describe("getRecurringRules", () => {
  it("DB 행을 앱 모델로 변환하고 금액을 숫자로 반환한다", async () => {
    const query = makeQuery({ data: [row], error: null });
    getSupabaseClientMock.mockReturnValue({ from: vi.fn(() => query) });
    const { getRecurringRules } = await import("./recurring");

    const result = await getRecurringRules();

    expect(result).toEqual([
      expect.objectContaining({
        id: "rule-1",
        householdId: "household-1",
        paymentMethod: "card",
        dayOfMonth: 31,
        amount: 150000,
        nextDueDate: "2026-08-31"
      })
    ]);
    expect(query.order).toHaveBeenCalledWith("active", { ascending: false });
  });
});

describe("createRecurringRule", () => {
  it("현재 사용자와 공유공간을 확인한 뒤 소유 정보를 포함해 저장한다", async () => {
    const membershipQuery = makeQuery({
      data: { household_id: "household-1" },
      error: null
    });
    const mutationQuery = makeQuery({ data: row, error: null });
    const from = vi.fn((table: string) =>
      table === "household_members" ? membershipQuery : mutationQuery
    );
    getSupabaseClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null
        })
      },
      from
    });
    const { createRecurringRule } = await import("./recurring");

    await createRecurringRule({
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
    });

    expect(membershipQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(mutationQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        household_id: "household-1",
        created_by: "user-1",
        payment_method: "card",
        day_of_month: 31
      })
    );
    expect(mutationQuery.insert.mock.calls[0][0]).not.toHaveProperty("next_due_date");
  });

  it("로그인 사용자가 없으면 저장하지 않고 명확한 오류를 반환한다", async () => {
    const from = vi.fn();
    getSupabaseClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null })
      },
      from
    });
    const { createRecurringRule } = await import("./recurring");

    await expect(
      createRecurringRule({
        type: "expense",
        paymentMethod: "card",
        inputter: "husband",
        category: "주거",
        amount: 1000,
        memo: "테스트",
        dayOfMonth: 1,
        startDate: "2026-08-01",
        endDate: null,
        active: true
      })
    ).rejects.toThrow("로그인이 필요합니다.");
    expect(from).not.toHaveBeenCalled();
  });
});
