import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn()
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock
}));

const makeRow = (id: string, amount: number | string = 1000) => ({
  id,
  type: "expense",
  payment_method: "card",
  inputter: "husband",
  category: "식비",
  amount,
  memo: id,
  date: "2026-08-29"
});

const createBuilder = () => {
  const builder = {} as {
    select: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    gte: ReturnType<typeof vi.fn>;
    lt: ReturnType<typeof vi.fn>;
    range: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
  };

  builder.select = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.gte = vi.fn(() => builder);
  builder.lt = vi.fn(() => builder);
  builder.range = vi.fn();
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = vi.fn();
  return builder;
};

const loadApi = async (builder: ReturnType<typeof createBuilder>) => {
  const from = vi.fn(() => builder);
  createClientMock.mockReturnValue({ from });
  const api = await import("./api");
  return { api, from };
};

beforeEach(() => {
  vi.resetModules();
  createClientMock.mockReset();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getTransactions", () => {
  it("기간 조건과 안정적인 정렬을 적용해 1000건 단위로 끝까지 조회한다", async () => {
    const builder = createBuilder();
    const firstPage = Array.from({ length: 1000 }, (_, index) =>
      makeRow(`row-${index}`, "1234")
    );
    builder.range
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({ data: [makeRow("last-row", "5678")], error: null });
    const { api } = await loadApi(builder);

    const transactions = await api.getTransactions({
      startDate: "2026-08-01",
      endDateExclusive: "2026-09-01"
    });

    expect(builder.gte).toHaveBeenCalledWith("date", "2026-08-01");
    expect(builder.lt).toHaveBeenCalledWith("date", "2026-09-01");
    expect(builder.order).toHaveBeenNthCalledWith(1, "date", { ascending: false });
    expect(builder.order).toHaveBeenNthCalledWith(2, "id", { ascending: false });
    expect(builder.range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(builder.range).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(transactions).toHaveLength(1001);
    expect(transactions[0].amount).toBe(1234);
    expect(transactions.at(-1)?.amount).toBe(5678);
  });

  it("연속 호출마다 Supabase를 다시 조회해 전역 캐시를 남기지 않는다", async () => {
    const builder = createBuilder();
    builder.range
      .mockResolvedValueOnce({ data: [makeRow("first")], error: null })
      .mockResolvedValueOnce({ data: [makeRow("second")], error: null });
    const { api, from } = await loadApi(builder);
    const range = {
      startDate: "2026-08-01",
      endDateExclusive: "2026-09-01"
    };

    const first = await api.getTransactions(range);
    const second = await api.getTransactions(range);

    expect(from).toHaveBeenCalledTimes(2);
    expect(builder.range).toHaveBeenCalledTimes(2);
    expect(first[0].id).toBe("first");
    expect(second[0].id).toBe("second");
  });
});

describe("getTransaction", () => {
  it("편집할 거래를 ID로 한 건 조회한다", async () => {
    const builder = createBuilder();
    builder.maybeSingle.mockResolvedValue({
      data: makeRow("edit-id", "9900"),
      error: null
    });
    const { api } = await loadApi(builder);

    const result = await api.getTransaction("edit-id");

    expect(builder.eq).toHaveBeenCalledWith("id", "edit-id");
    expect(result).toMatchObject({ id: "edit-id", amount: 9900 });
  });
});
