import { createHash } from "node:crypto";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import type { ExportFormat, ExportTransaction } from "@/types/export";
import {
  buildExportArtifact,
  exportFileName,
  summarizeTransactions
} from "@/utils/export";

type ExportEmailErrorDetails = {
  providerCode?: string;
  providerStatus?: number;
};

export class ExportEmailConfigurationError extends Error {
  readonly providerCode?: string;
  readonly providerStatus?: number;

  constructor(message: string, details: ExportEmailErrorDetails = {}) {
    super(message);
    this.name = "ExportEmailConfigurationError";
    this.providerCode = details.providerCode;
    this.providerStatus = details.providerStatus;
  }
}

export class ExportEmailDeliveryError extends Error {
  readonly providerCode?: string;
  readonly providerStatus?: number;

  constructor(message: string, details: ExportEmailErrorDetails = {}) {
    super(message);
    this.name = "ExportEmailDeliveryError";
    this.providerCode = details.providerCode;
    this.providerStatus = details.providerStatus;
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

export type SendHouseholdInviteEmailInput = {
  householdId: string;
  inviteId: string;
  householdName: string;
  inviterDisplayName: string;
  recipientEmail: string;
  inviteUrl: string;
};

type GmailSmtpConfiguration = {
  user: string;
  appPassword: string;
  fromName: string;
};

type SmtpError = Error & {
  code?: string;
  responseCode?: number;
};

const gmailSmtpConfiguration = (): GmailSmtpConfiguration | null => {
  const user = process.env.GMAIL_SMTP_USER?.trim() || "";
  const appPassword =
    process.env.GMAIL_SMTP_APP_PASSWORD?.replace(/\s/g, "") || "";

  if (!user && !appPassword) {
    return null;
  }
  if (!user || !appPassword) {
    throw new ExportEmailConfigurationError(
      "GMAIL_SMTP_USER와 GMAIL_SMTP_APP_PASSWORD를 모두 설정해 주세요."
    );
  }

  return {
    user,
    appPassword,
    fromName: process.env.GMAIL_SMTP_FROM_NAME?.trim() || "솔샘네 가계부"
  };
};

const deterministicMessageId = (idempotencyKey: string) =>
  `<${createHash("sha256").update(idempotencyKey).digest("hex")}@go-calc-blond.vercel.app>`;

const isSmtpConfigurationError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  const smtpError = error as SmtpError;
  return (
    ["EAUTH", "ENOAUTH", "ECONFIG"].includes(smtpError.code || "") ||
    smtpError.responseCode === 535
  );
};

const smtpErrorDetails = (error: unknown): ExportEmailErrorDetails => {
  if (!(error instanceof Error)) {
    return {};
  }

  const smtpError = error as SmtpError;
  return {
    providerCode:
      typeof smtpError.code === "string" ? smtpError.code : undefined,
    providerStatus:
      typeof smtpError.responseCode === "number"
        ? smtpError.responseCode
        : undefined
  };
};

const sendWithGmailSmtp = async ({
  configuration,
  recipientEmail,
  subject,
  text,
  html,
  attachment,
  filename,
  idempotencyKey
}: {
  configuration: GmailSmtpConfiguration;
  recipientEmail: string;
  subject: string;
  text: string;
  html?: string;
  attachment?: Buffer;
  filename?: string;
  idempotencyKey: string;
}) => {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: configuration.user,
      pass: configuration.appPassword
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000
  });

  try {
    const info = await transporter.sendMail({
      from: {
        name: configuration.fromName,
        address: configuration.user
      },
      to: [recipientEmail],
      subject,
      text,
      ...(html ? { html } : {}),
      messageId: deterministicMessageId(idempotencyKey),
      ...(attachment && filename
        ? { attachments: [{ content: attachment, filename }] }
        : {}),
      disableFileAccess: true,
      disableUrlAccess: true
    });

    const accepted = Array.isArray(info.accepted) ? info.accepted : [];
    const rejected = Array.isArray(info.rejected) ? info.rejected : [];
    if (accepted.length === 0 || rejected.length > 0) {
      throw new ExportEmailDeliveryError(
        "Gmail SMTP가 수신 주소를 거부했습니다."
      );
    }

    return { id: info.messageId || deterministicMessageId(idempotencyKey) };
  } catch (error) {
    if (error instanceof ExportEmailDeliveryError) {
      throw error;
    }
    if (isSmtpConfigurationError(error)) {
      throw new ExportEmailConfigurationError(
        "Gmail SMTP 인증에 실패했습니다. Gmail 주소와 앱 비밀번호를 확인해 주세요.",
        smtpErrorDetails(error)
      );
    }
    throw new ExportEmailDeliveryError(
      "Gmail SMTP가 메일을 전송하지 못했습니다.",
      smtpErrorDetails(error)
    );
  }
};

export const sendExportEmail = async ({
  householdId,
  recipientEmail,
  format,
  month,
  transactions,
  idempotencyKey
}: SendExportEmailInput) => {
  if (!idempotencyKey || idempotencyKey.length > 256) {
    throw new ExportEmailDeliveryError("이메일 중복 방지 키가 올바르지 않습니다.");
  }

  const attachment = await buildExportArtifact(transactions, month, format);
  const summary = summarizeTransactions(transactions);
  const subject = `[솔샘네 가계부] ${month} 거래내역`;
  const text = [
    `${month} 솔샘네 가계부 거래내역을 첨부합니다.`,
    `총 ${transactions.length}건`,
    `수입 ${summary.income.toLocaleString("ko-KR")}원`,
    `지출 ${summary.expense.toLocaleString("ko-KR")}원`,
    `잔액 ${summary.balance.toLocaleString("ko-KR")}원`
  ].join("\n");
  const filename = exportFileName(month, format);
  const smtpConfiguration = gmailSmtpConfiguration();

  if (smtpConfiguration) {
    return sendWithGmailSmtp({
      configuration: smtpConfiguration,
      recipientEmail,
      subject,
      text,
      attachment,
      filename,
      idempotencyKey
    });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new ExportEmailConfigurationError(
      "Gmail SMTP 또는 Resend 환경 설정이 필요합니다."
    );
  }

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send(
    {
      from,
      to: [recipientEmail],
      subject,
      text,
      attachments: [
        {
          content: attachment.toString("base64"),
          filename
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

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[character] || character
  );

export const sendHouseholdInviteEmail = async ({
  householdId,
  inviteId,
  householdName,
  inviterDisplayName,
  recipientEmail,
  inviteUrl
}: SendHouseholdInviteEmailInput) => {
  const idempotencyKey = `household-invite/${inviteId}`;
  const subject = `[솔샘네 가계부] ${inviterDisplayName}님의 가족 초대`;
  const text = [
    `${inviterDisplayName}님이 ${householdName}에 초대했습니다.`,
    "아래 링크에서 초대받은 이메일 계정으로 로그인한 뒤 참여를 승인해 주세요.",
    inviteUrl,
    "이 초대는 7일 후 만료됩니다."
  ].join("\n\n");
  const safeHouseholdName = escapeHtml(householdName);
  const safeInviterName = escapeHtml(inviterDisplayName);
  const safeInviteUrl = escapeHtml(inviteUrl);
  const html = `
    <div style="margin:0 auto;max-width:520px;padding:32px 20px;font-family:Arial,'Apple SD Gothic Neo',sans-serif;color:#0f172a">
      <p style="margin:0;color:#2563eb;font-size:13px;font-weight:700">솔샘네 가계부</p>
      <h1 style="margin:12px 0 8px;font-size:24px;line-height:1.35">가족 초대가 도착했습니다</h1>
      <p style="margin:0 0 24px;color:#475569;line-height:1.7"><strong>${safeInviterName}</strong>님이 <strong>${safeHouseholdName}</strong>에 초대했습니다.</p>
      <a href="${safeInviteUrl}" style="display:inline-block;border-radius:12px;background:#2563eb;padding:13px 20px;color:#fff;text-decoration:none;font-weight:700">로그인하고 승인하기</a>
      <p style="margin:24px 0 0;color:#64748b;font-size:13px;line-height:1.6">초대받은 이메일 계정으로 로그인해 주세요. 초대는 7일 후 만료됩니다.</p>
    </div>
  `.trim();
  const smtpConfiguration = gmailSmtpConfiguration();

  if (smtpConfiguration) {
    return sendWithGmailSmtp({
      configuration: smtpConfiguration,
      recipientEmail,
      subject,
      text,
      html,
      idempotencyKey
    });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new ExportEmailConfigurationError(
      "Gmail SMTP 또는 Resend 환경 설정이 필요합니다."
    );
  }

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send(
    {
      from,
      to: [recipientEmail],
      subject,
      text,
      html,
      tags: [
        { name: "feature", value: "household_invite" },
        { name: "household", value: householdId.replace(/-/g, "_") }
      ]
    },
    { idempotencyKey }
  );

  if (error || !data?.id) {
    throw new ExportEmailDeliveryError(
      error?.message || "초대 메일을 전송하지 못했습니다."
    );
  }

  return { id: data.id };
};
