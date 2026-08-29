import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { ExportTransaction } from "@/types/export";
import {
  buildCsv,
  buildXlsx,
  isExportMonth,
  previousKoreaMonthKey,
  summarizeTransactions
} from "./export";

const makeTransaction = (
  overrides: Partial<ExportTransaction> = {}
): ExportTransaction => ({
  id: "transaction-1",
  type: "expense",
  paymentMethod: "card",
  inputter: "husband",
  category: "식비",
  amount: 12000,
  memo: "장보기",
  date: "2026-08-03",
  ...overrides
});

describe("buildCsv", () => {
  it("UTF-8 BOM과 CRLF를 포함하고 쉼표·따옴표·줄바꿈을 올바르게 이스케이프한다", () => {
    const csv = buildCsv([
      makeTransaction({ category: "식비,외식", memo: '쿠폰 "사용"\n완료' })
    ]);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"날짜","구분","결제수단","입력자","카테고리","금액","메모"\r\n');
    expect(csv).toContain('"식비,외식"');
    expect(csv).toContain('"쿠폰 ""사용""\n완료"');
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("사용자 입력값이 Excel 수식으로 실행되지 않도록 보호한다", () => {
    const csv = buildCsv([
      makeTransaction({ category: '=HYPERLINK("https://example.com")', memo: "  +1+1" })
    ]);

    expect(csv).toContain('"\'=HYPERLINK(""https://example.com"")"');
    expect(csv).toContain('"\'  +1+1"');
  });
});

describe("buildXlsx", () => {
  it("날짜와 금액을 실제 Excel 셀 타입으로 저장한다", async () => {
    const transactions = [makeTransaction({ memo: "=2+2", amount: 34567 })];
    const buffer = await buildXlsx(transactions, "2026-08");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]
    );
    const worksheet = workbook.getWorksheet("거래내역");

    expect(worksheet).toBeDefined();
    expect(worksheet?.getCell("A3").value).toBe("날짜");
    expect(worksheet?.getCell("A4").value).toBeInstanceOf(Date);
    expect(worksheet?.getCell("A4").numFmt).toBe("yyyy-mm-dd");
    expect(worksheet?.getCell("F4").value).toBe(34567);
    expect(worksheet?.getCell("F4").numFmt).toBe('#,##0"원"');
    expect(worksheet?.getCell("G4").value).toBe("=2+2");
  });

  it("같은 월과 거래내역에는 동일한 파일을 생성한다", async () => {
    const transactions = [makeTransaction()];
    const first = await buildXlsx(transactions, "2026-08");
    const second = await buildXlsx(transactions, "2026-08");

    expect(first.equals(second)).toBe(true);
  });
});

describe("export helpers", () => {
  it("유효한 월만 허용한다", () => {
    expect(isExportMonth("2026-08")).toBe(true);
    expect(isExportMonth("2026-00")).toBe(false);
    expect(isExportMonth("2026-13")).toBe(false);
    expect(isExportMonth(["2026-08"])).toBe(false);
  });

  it("한국 시간 기준 직전 월을 계산한다", () => {
    expect(previousKoreaMonthKey(new Date("2026-01-31T15:10:00.000Z"))).toBe(
      "2026-01"
    );
    expect(previousKoreaMonthKey(new Date("2026-01-31T14:59:00.000Z"))).toBe(
      "2025-12"
    );
  });

  it("수입, 지출, 잔액을 합산한다", () => {
    expect(
      summarizeTransactions([
        makeTransaction({ type: "income", amount: 50000 }),
        makeTransaction({ type: "expense", amount: 12500 })
      ])
    ).toEqual({ income: 50000, expense: 12500, balance: 37500 });
  });
});
