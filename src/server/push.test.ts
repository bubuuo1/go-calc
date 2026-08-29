import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn()
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: mocks.setVapidDetails,
    sendNotification: mocks.sendNotification
  }
}));

import {
  PushConfigurationError,
  sendPushNotifications
} from "@/server/push";

const environmentKeys = [
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT"
] as const;

const originalEnvironment = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]])
) as Record<(typeof environmentKeys)[number], string | undefined>;

const subscription = {
  endpoint: "https://push.example/subscription",
  p256dh: "public-encryption-key",
  auth: "authentication-secret"
};

const payload = {
  title: "솔샘네 가계부",
  body: "알림 테스트",
  url: "/settings",
  tag: "test"
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of environmentKeys) {
    delete process.env[key];
  }
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

describe("sendPushNotifications", () => {
  it("VAPID 설정이 없으면 구독 엔드포인트에 요청하지 않는다", async () => {
    await expect(
      sendPushNotifications([subscription], payload)
    ).rejects.toBeInstanceOf(PushConfigurationError);
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });

  it("VAPID로 페이로드를 암호화해 구독 기기에 전송한다", async () => {
    process.env.VAPID_PUBLIC_KEY = "public-vapid-key";
    process.env.VAPID_PRIVATE_KEY = "private-vapid-key";
    process.env.VAPID_SUBJECT = "https://go-calc-blond.vercel.app";
    mocks.sendNotification.mockResolvedValue({ statusCode: 201 });

    await expect(
      sendPushNotifications([subscription], payload)
    ).resolves.toEqual({
      sent: 1,
      failed: 0,
      staleEndpoints: []
    });

    expect(mocks.setVapidDetails).toHaveBeenCalledWith(
      "https://go-calc-blond.vercel.app",
      "public-vapid-key",
      "private-vapid-key"
    );
    expect(mocks.sendNotification).toHaveBeenCalledWith(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth
        }
      },
      JSON.stringify(payload),
      expect.objectContaining({ TTL: 3600 })
    );
  });

  it("404·410 응답 구독은 정리 대상으로 반환한다", async () => {
    process.env.VAPID_PUBLIC_KEY = "public-vapid-key";
    process.env.VAPID_PRIVATE_KEY = "private-vapid-key";
    mocks.sendNotification.mockRejectedValue(
      Object.assign(new Error("subscription gone"), { statusCode: 410 })
    );

    await expect(
      sendPushNotifications([subscription], payload)
    ).resolves.toEqual({
      sent: 0,
      failed: 1,
      staleEndpoints: [subscription.endpoint]
    });
  });
});
