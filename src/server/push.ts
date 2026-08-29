import webpush from "web-push";

export type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type LedgerPushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  badge?: number;
};

type WebPushError = Error & {
  statusCode?: number;
};

export class PushConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PushConfigurationError";
  }
}

const getConfiguration = () => {
  const publicKey =
    process.env.VAPID_PUBLIC_KEY ||
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    "";
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  const subject =
    process.env.VAPID_SUBJECT || "https://go-calc-blond.vercel.app";

  if (!publicKey || !privateKey) {
    throw new PushConfigurationError("Web Push VAPID 환경 설정이 누락되었습니다.");
  }
  if (!subject.startsWith("mailto:") && !subject.startsWith("https://")) {
    throw new PushConfigurationError("VAPID_SUBJECT 형식이 올바르지 않습니다.");
  }

  return { publicKey, privateKey, subject };
};

export const sendPushNotifications = async (
  subscriptions: PushSubscriptionRow[],
  payload: LedgerPushPayload
) => {
  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0, staleEndpoints: [] as string[] };
  }

  const configuration = getConfiguration();
  webpush.setVapidDetails(
    configuration.subject,
    configuration.publicKey,
    configuration.privateKey
  );

  const results = await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth
            }
          },
          JSON.stringify(payload),
          {
            TTL: 60 * 60,
            urgency: "normal"
          }
        );
        return { ok: true, endpoint: subscription.endpoint, stale: false };
      } catch (error) {
        const statusCode = (error as WebPushError).statusCode;
        const stale = statusCode === 404 || statusCode === 410;
        if (!stale) {
          console.error("Web Push 전송에 실패했습니다.", {
            statusCode,
            message: error instanceof Error ? error.message : "Unknown error"
          });
        }
        return { ok: false, endpoint: subscription.endpoint, stale };
      }
    })
  );

  return {
    sent: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    staleEndpoints: results
      .filter((result) => result.stale)
      .map((result) => result.endpoint)
  };
};
