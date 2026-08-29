import { getSupabaseBrowserClient } from "@/services/supabase";

const publicVapidKey = () =>
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || "";

const urlBase64ToUint8Array = (value: string) => {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(Array.from(raw).map((character) => character.charCodeAt(0)));
};

export const isPushSupported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window &&
  Boolean(publicVapidKey());

const getRegistration = async (createIfMissing: boolean) => {
  if (!("serviceWorker" in navigator)) {
    throw new Error("이 브라우저에서는 알림을 지원하지 않습니다.");
  }

  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing || !createIfMissing) {
    return existing;
  }

  return navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none"
  });
};

const getAccessToken = async () => {
  const { data, error } = await getSupabaseBrowserClient().auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("로그인이 만료되었습니다. 다시 로그인해 주세요.");
  }
  return data.session.access_token;
};

export const getPushNotificationState = async () => {
  if (!isPushSupported()) {
    return {
      supported: false,
      permission:
        typeof Notification === "undefined" ? "default" : Notification.permission,
      subscribed: false
    } as const;
  }

  const registration = await getRegistration(false);
  const subscription = registration
    ? await registration.pushManager.getSubscription()
    : null;
  return {
    supported: true,
    permission: Notification.permission,
    subscribed: Boolean(subscription)
  } as const;
};

export const enablePushNotifications = async () => {
  if (!isPushSupported()) {
    throw new Error("이 브라우저 또는 현재 배포 설정에서는 알림을 지원하지 않습니다.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("알림 권한이 허용되지 않았습니다.");
  }

  const registration = await getRegistration(true);
  if (!registration) {
    throw new Error("서비스 워커를 준비하지 못했습니다.");
  }

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicVapidKey())
    }));
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) {
    await subscription.unsubscribe();
    throw new Error("브라우저 알림 구독 정보가 올바르지 않습니다.");
  }

  const { error } = await getSupabaseBrowserClient()
    .from("push_subscriptions")
    .upsert(
      {
        endpoint: json.endpoint,
        p256dh,
        auth,
        user_agent: navigator.userAgent.slice(0, 500)
      },
      { onConflict: "endpoint" }
    );
  if (error) {
    await subscription.unsubscribe();
    throw error;
  }

  return subscription;
};

export const disablePushNotifications = async (bestEffort = false) => {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return;
  }

  try {
    const registration = await getRegistration(false);
    const subscription = registration
      ? await registration.pushManager.getSubscription()
      : null;
    if (!subscription) return;

    const { error } = await getSupabaseBrowserClient()
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", subscription.endpoint);
    if (error) {
      throw error;
    }
    await subscription.unsubscribe();
  } catch (error) {
    if (!bestEffort) {
      throw error;
    }
    console.warn("푸시 알림 구독을 완전히 정리하지 못했습니다.", error);
  }
};

export const sendTestPushNotification = async () => {
  const accessToken = await getAccessToken();
  const response = await fetch("/api/push/test", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken
    }
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(body?.error || "테스트 알림을 보내지 못했습니다.");
  }
};
