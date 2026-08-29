import { Resend } from "resend";
import type { ExportFormat, ExportTransaction } from "@/types/export";
import {
  buildExportArtifact,
  exportFileName,
  summarizeTransactions
} from "@/utils/export";

export class ExportEmailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportEmailConfigurationError";
  }
}

export class ExportEmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportEmailDeliveryError";
  }
}

export type SendExportEmailInput = {
  householdId: string;
  recipientEmail: string;
  format: ExportFormat;
  month: string;
  transactions: ExportTransaction[];
  idempotencyKey: string;
};

export const sendExportEmail = async ({
  householdId,
  recipientEmail,
  format,
  month,
  transactions,
  idempotencyKey
}: SendExportEmailInput) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    throw new ExportEmailConfigurationError(
      "RESEND_API_KEY 또는 RESEND_FROM_EMAIL이 설정되지 않았습니다."
    );
  }

  if (!idempotencyKey || idempotencyKey.length > 256) {
    throw new ExportEmailDeliveryError("이메일 중복 방지 키가 올바르지 않습니다.");
  }

  const attachment = await buildExportArtifact(transactions, month, format);
  const summary = summarizeTransactions(transactions);
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send(
    {
      from,
      to: [recipientEmail],
      subject: `[솔샘네 가계부] ${month} 거래내역`,
      text: [
        `${month} 솔샘네 가계부 거래내역을 첨부합니다.`,
        `총 ${transactions.length}건`,
        `수입 ${summary.income.toLocaleString("ko-KR")}원`,
        `지출 ${summary.expense.toLocaleString("ko-KR")}원`,
        `잔액 ${summary.balance.toLocaleString("ko-KR")}원`
      ].join("\n"),
      attachments: [
        {
          content: attachment.toString("base64"),
          filename: exportFileName(month, format)
        }
      ],
      tags: [
        { name: "feature", value: "ledger_export" },
        { name: "household", value: householdId.replace(/-/g, "_") }
      ]
    },
    { idempotencyKey }
  );

  if (error || !data?.id) {
    throw new ExportEmailDeliveryError(
      error?.message || "메일 서비스가 전송을 완료하지 못했습니다."
    );
  }

  return { id: data.id };
};
