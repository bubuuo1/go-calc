import { describe, expect, it } from "vitest";
import {
  monthDateRange,
  monthWithPreviousDateRange,
  shiftMonthKey,
  toKoreaDateKey,
  yearDateRange
} from "./month";

describe("한국 날짜 계산", () => {
  it("한국 자정 경계에서 UTC 전날을 반환하지 않는다", () => {
    expect(toKoreaDateKey(new Date("2026-08-28T14:59:59Z"))).toBe("2026-08-28");
    expect(toKoreaDateKey(new Date("2026-08-28T15:00:00Z"))).toBe("2026-08-29");
  });

  it("한국의 새해 자정을 다음 연도로 계산한다", () => {
    expect(toKoreaDateKey(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01-01");
  });
});

describe("거래 조회 기간", () => {
  it("12월의 종료 경계를 다음 해 1월로 계산한다", () => {
    expect(monthDateRange("2026-12")).toEqual({
      startDate: "2026-12-01",
      endDateExclusive: "2027-01-01"
    });
  });

  it("윤년 2월도 다음 달 첫날을 종료 경계로 사용한다", () => {
    expect(monthDateRange("2024-02")).toEqual({
      startDate: "2024-02-01",
      endDateExclusive: "2024-03-01"
    });
  });

  it("통계 조회에 이전 달과 선택 달만 포함한다", () => {
    expect(monthWithPreviousDateRange("2027-01")).toEqual({
      startDate: "2026-12-01",
      endDateExclusive: "2027-02-01"
    });
  });

  it("연도와 월 이동 경계를 계산한다", () => {
    expect(yearDateRange("2026")).toEqual({
      startDate: "2026-01-01",
      endDateExclusive: "2027-01-01"
    });
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
  });
});
