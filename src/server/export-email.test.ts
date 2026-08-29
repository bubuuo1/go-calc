import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(),
  resendConstructor: vi.fn(),
  resendSend: vi.fn()
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: mocks.createTransport
  }
}));

vi.mock("resend", () => ({
  Resend: mocks.resendConstructor
}));

import {
  ExportEmailConfigurationError,
  ExportEmailDeliveryError,
  sendExportEmail,
  sendHouseholdInviteEmail
} from "./export-email";

const environmentKeys = [
  "GMAIL_SMTP_USER",
  "GMAIL_SMTP_APP_PASSWORD",
  "GMAIL_SMTP_FROM_NAME",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL"
] as const;

const originalEnvironment = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]])
) as Record<(typeof environmentKeys)[number], string | undefined>;

const input = {
  householdId: "household-1",
  recipientEmail: "receiver@naver.com",
  format: "csv" as const,
  month: "2026-08",
  transactions: [],
  idempotencyKey: "manual-ledger-household-1-2026-08-request-1"
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of environmentKeys) {
    delete process.env[key];
  }

  mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
  mocks.resendConstructor.mockImplementation(() => ({
    emails: { send: mocks.resendSend }
  }));
});

afterAll(() => {
  for (const key of environmentKeys) {
    const value = originalEnvironment[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("sendExportEmail", () => {
  it("Gmail SMTP가 설정되면 임의 수신자에게 TLS 메일을 보낸다", async () => {
    process.env.GMAIL_SMTP_USER = "sender@gmail.com";
    process.env.GMAIL_SMTP_APP_PASSWORD = "abcd efgh ijkl mnop";
    process.env.GMAIL_SMTP_FROM_NAME = "테스트 가계부";
    process.env.RESEND_API_KEY = "re_fallback";
    process.env.RESEND_FROM_EMAIL = "Fallback <onboarding@resend.dev>";
    mocks.sendMail.mockResolvedValue({
      accepted: [input.recipientEmail],
      rejected: [],
      messageId: "<gmail-message-id>"
    });

    await expect(sendExportEmail(input)).resolves.toEqual({
      id: "<gmail-message-id>"
    });

    expect(mocks.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          user: "sender@gmail.com",
          pass: "abcdefghijklmnop"
        }
      })
    );
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { name: "테스트 가계부", address: "sender@gmail.com" },
        to: [input.recipientEmail],
        attachments: [
          expect.objectContaining({
            content: expect.any(Buffer),
            filename: "solsaem-ledger-2026-08.csv"
          })
        ],
        disableFileAccess: true,
        disableUrlAccess: true,
        messageId: expect.stringMatching(
          /^<[a-f0-9]{64}@go-calc-blond\.vercel\.app>$/
        )
      })
    );
    expect(mocks.resendConstructor).not.toHaveBeenCalled();
  });

  it("같은 중복 방지 키에는 같은 Message-ID를 사용한다", async () => {
    process.env.GMAIL_SMTP_USER = "sender@gmail.com";
    process.env.GMAIL_SMTP_APP_PASSWORD = "abcdefghijklmnop";
    mocks.sendMail.mockResolvedValue({
      accepted: [input.recipientEmail],
      rejected: [],
      messageId: ""
    });

    const first = await sendExportEmail(input);
    const second = await sendExportEmail(input);

    expect(first.id).toBe(second.id);
    expect(first.id).toMatch(
      /^<[a-f0-9]{64}@go-calc-blond\.vercel\.app>$/
    );
  });

  it("Gmail SMTP 환경변수가 일부만 있으면 구성 오류를 반환한다", async () => {
    process.env.GMAIL_SMTP_USER = "sender@gmail.com";

    await expect(sendExportEmail(input)).rejects.toBeInstanceOf(
      ExportEmailConfigurationError
    );
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });

  it("Gmail 인증 실패를 구성 오류로 분류하고 비밀값을 노출하지 않는다", async () => {
    process.env.GMAIL_SMTP_USER = "sender@gmail.com";
    process.env.GMAIL_SMTP_APP_PASSWORD = "secret-app-password";
    mocks.sendMail.mockRejectedValue(
      Object.assign(new Error("authentication failed"), { code: "EAUTH" })
    );

    const error = await sendExportEmail(input).catch((caught) => caught);

    expect(error).toBeInstanceOf(ExportEmailConfigurationError);
    expect((error as Error).message).not.toContain("secret-app-password");
    expect((error as ExportEmailConfigurationError).providerCode).toBe(
      "EAUTH"
    );
  });

  it("SMTP가 수신자를 거부하면 전송 오류를 반환한다", async () => {
    process.env.GMAIL_SMTP_USER = "sender@gmail.com";
    process.env.GMAIL_SMTP_APP_PASSWORD = "abcdefghijklmnop";
    mocks.sendMail.mockResolvedValue({
      accepted: [],
      rejected: [input.recipientEmail],
      messageId: "<rejected>"
    });

    await expect(sendExportEmail(input)).rejects.toBeInstanceOf(
      ExportEmailDeliveryError
    );
  });

  it("Gmail 설정이 없으면 기존 Resend 경로를 유지한다", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "Ledger <onboarding@resend.dev>";
    mocks.resendSend.mockResolvedValue({
      data: { id: "resend-message-id" },
      error: null
    });

    await expect(sendExportEmail(input)).resolves.toEqual({
      id: "resend-message-id"
    });
    expect(mocks.resendSend).toHaveBeenCalledOnce();
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });
});

describe("sendHouseholdInviteEmail", () => {
  it("첨부 없이 승인 링크가 담긴 초대 메일을 보낸다", async () => {
    process.env.GMAIL_SMTP_USER = "sender@gmail.com";
    process.env.GMAIL_SMTP_APP_PASSWORD = "abcdefghijklmnop";
    mocks.sendMail.mockResolvedValue({
      accepted: ["family@example.com"],
      rejected: [],
      messageId: "<invite-message-id>"
    });

    await expect(
      sendHouseholdInviteEmail({
        householdId: "household-1",
        inviteId: "invite-1",
        householdName: "우리집 가계부",
        inviterDisplayName: "솔샘",
        recipientEmail: "family@example.com",
        inviteUrl: "https://go-calc-blond.vercel.app/invite?token=GI-test"
      })
    ).resolves.toEqual({ id: "<invite-message-id>" });

    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["family@example.com"],
        subject: "[솔샘네 가계부] 솔샘님의 가족 초대",
        text: expect.stringContaining(
          "https://go-calc-blond.vercel.app/invite?token=GI-test"
        ),
        html: expect.stringContaining("로그인하고 승인하기"),
        disableFileAccess: true,
        disableUrlAccess: true
      })
    );
    expect(mocks.sendMail.mock.calls[0][0]).not.toHaveProperty("attachments");
  });
});
