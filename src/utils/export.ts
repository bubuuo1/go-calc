import ExcelJS from "exceljs";
import type { ExportFormat, ExportTransaction } from "@/types/export";

export { isExportMonth, previousKoreaMonthKey } from "./export-shared";

const CSV_HEADERS = [
  "날짜",
  "구분",
  "결제수단",
  "입력자",
  "카테고리",
  "금액",
  "메모"
] as const;

const MIME_TYPES: Record<ExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

const typeLabel = (type: ExportTransaction["type"]) =>
  type === "income" ? "수입" : "지출";

const paymentMethodLabel = (method: ExportTransaction["paymentMethod"]) =>
  method === "cash" ? "현금" : "카드";

const inputterLabel = (inputter: ExportTransaction["inputter"]) =>
  inputter === "husband" ? "남편" : "아내";

const protectCsvFormula = (value: string) =>
  /^(?:[\t\r]|\s*[=+\-@])/.test(value) ? `'${value}` : value;

const quoteCsv = (value: string) =>
  `"${protectCsvFormula(value).replace(/"/g, '""')}"`;

const transactionValues = (transaction: ExportTransaction) => [
  transaction.date,
  typeLabel(transaction.type),
  paymentMethodLabel(transaction.paymentMethod),
  inputterLabel(transaction.inputter),
  transaction.category,
  transaction.amount,
  transaction.memo
] as const;

export const buildCsv = (transactions: ExportTransaction[]) => {
  const rows = transactions.map((transaction) =>
    transactionValues(transaction)
      .map((value) =>
        typeof value === "number" ? String(value) : quoteCsv(value)
      )
      .join(",")
  );

  return `\uFEFF${CSV_HEADERS.map(quoteCsv).join(",")}\r\n${rows.join("\r\n")}${
    rows.length ? "\r\n" : ""
  }`;
};

const toExcelDate = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

export const buildXlsx = async (
  transactions: ExportTransaction[],
  month: string
) => {
  const workbook = new ExcelJS.Workbook();
  const fixedTimestamp = new Date(`${month}-01T00:00:00.000Z`);
  workbook.creator = "솔샘네 가계부";
  workbook.created = fixedTimestamp;
  workbook.modified = fixedTimestamp;

  const worksheet = workbook.addWorksheet("거래내역", {
    views: [{ state: "frozen", ySplit: 3 }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0
    }
  });

  worksheet.mergeCells("A1:G1");
  const titleCell = worksheet.getCell("A1");
  titleCell.value = `${month} 솔샘네 가계부`;
  titleCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 16 };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1D4ED8" }
  };
  worksheet.getRow(1).height = 30;

  const summary = summarizeTransactions(transactions);
  worksheet.mergeCells("A2:G2");
  const summaryCell = worksheet.getCell("A2");
  summaryCell.value = `총 ${transactions.length}건 · 수입 ${summary.income.toLocaleString(
    "ko-KR"
  )}원 · 지출 ${summary.expense.toLocaleString("ko-KR")}원 · 잔액 ${summary.balance.toLocaleString(
    "ko-KR"
  )}원`;
  summaryCell.font = { bold: true, color: { argb: "FF1E3A8A" }, size: 10 };
  summaryCell.alignment = { vertical: "middle", horizontal: "left" };
  summaryCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEFF6FF" }
  };
  worksheet.getRow(2).height = 22;

  const headerRow = worksheet.getRow(3);
  headerRow.values = [...CSV_HEADERS];
  headerRow.height = 23;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2563EB" }
    };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFBFDBFE" } }
    };
  });

  transactions.forEach((transaction, index) => {
    const row = worksheet.getRow(index + 4);
    row.values = [
      toExcelDate(transaction.date),
      typeLabel(transaction.type),
      paymentMethodLabel(transaction.paymentMethod),
      inputterLabel(transaction.inputter),
      transaction.category,
      transaction.amount,
      transaction.memo
    ];
    row.getCell(1).numFmt = "yyyy-mm-dd";
    row.getCell(6).numFmt = '#,##0"원"';
    row.getCell(6).alignment = { horizontal: "right" };
    row.alignment = { vertical: "middle" };

    if (index % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" }
        };
      });
    }
  });

  worksheet.columns = [
    { key: "date", width: 13 },
    { key: "type", width: 10 },
    { key: "paymentMethod", width: 12 },
    { key: "inputter", width: 10 },
    { key: "category", width: 18 },
    { key: "amount", width: 16 },
    { key: "memo", width: 36 }
  ];
  worksheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: 7 }
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as unknown as ArrayBuffer);
};

export const summarizeTransactions = (transactions: ExportTransaction[]) => {
  const income = transactions.reduce(
    (total, transaction) =>
      transaction.type === "income" ? total + transaction.amount : total,
    0
  );
  const expense = transactions.reduce(
    (total, transaction) =>
      transaction.type === "expense" ? total + transaction.amount : total,
    0
  );

  return { income, expense, balance: income - expense };
};

export const buildExportArtifact = async (
  transactions: ExportTransaction[],
  month: string,
  format: ExportFormat
) => {
  if (format === "csv") {
    return Buffer.from(buildCsv(transactions), "utf8");
  }

  return buildXlsx(transactions, month);
};

export const exportFileName = (month: string, format: ExportFormat) =>
  `solsaem-ledger-${month}.${format}`;

export const exportMimeType = (format: ExportFormat) => MIME_TYPES[format];
