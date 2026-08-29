import type { NextApiRequest, NextApiResponse } from "next";
import {
  authenticateExportRequest,
  ExportRequestError
} from "@/server/export-data";
import {
  PushConfigurationError,
  sendPushNotifications
} from "@/server/push";
import type { PushSubscriptionRow } from "@/server/push";

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse
) {
  response.setHeader("Cache-Control", "private, no-store");
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ ok: false, error: "Method not allowed." });
  }

  try {
    const context = await authenticateExportRequest(request);
    const { data, error } = await context.supabase
      .from("push_subscriptions")
      .select("endpoint,p256dh,auth")
      .eq("user_id", context.user.id);
    if (error) {
      throw new ExportRequestError(
        500,
        "알림 구독 정보를 불러오지 못했습니다.",
        "push_subscription_lookup_failed"
      );
    }

    const subscriptions = (data || []) as PushSubscriptionRow[];
    if (subscriptions.length === 0) {
      return response.status(409).json({
        ok: false,
        error: "먼저 이 기기에서 알림을 켜 주세요."
      });
    }

    const result = await sendPushNotifications(subscriptions, {
      title: "솔샘네 가계부",
      body: "알림이 정상적으로 연결되었습니다.",
      url: "/settings",
      tag: "push-test"
    });

    if (result.staleEndpoints.length > 0) {
      await context.supabase
        .from("push_subscriptions")
        .delete()
        .in("endpoint", result.staleEndpoints);
    }

    if (result.sent === 0) {
      return response.status(502).json({
        ok: false,
        error: "기기로 테스트 알림을 전송하지 못했습니다."
      });
    }

    return response.status(200).json({ ok: true, sent: result.sent });
  } catch (error) {
    if (error instanceof ExportRequestError) {
      return response.status(error.statusCode).json({
        ok: false,
        error: error.message,
        code: error.code
      });
    }
    if (error instanceof PushConfigurationError) {
      return response.status(503).json({ ok: false, error: error.message });
    }

    console.error("테스트 푸시 알림 전송에 실패했습니다.", error);
    return response.status(500).json({
      ok: false,
      error: "테스트 알림을 처리하지 못했습니다."
    });
  }
}
