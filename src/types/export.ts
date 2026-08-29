export type ExportFormat = "csv" | "xlsx";

export type ExportSchedule = {
  householdId: string;
  recipientEmail: string;
  format: ExportFormat;
  sendDay: number;
  active: boolean;
  timezone: "Asia/Seoul";
  lastSentPeriod: string | null;
};

export type ExportScheduleInput = Pick<
  ExportSchedule,
  "recipientEmail" | "format" | "sendDay" | "active"
>;

export type ExportTransaction = {
  id: string;
  type: "income" | "expense";
  paymentMethod: "cash" | "card";
  inputter: "husband" | "wife";
  category: string;
  amount: number;
  memo: string;
  date: string;
};
