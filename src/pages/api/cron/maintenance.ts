import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";
import { sendExportEmail } from "@/server/export-email";
import { sendPushNotifications } from "@/server/push";
import type { LedgerPushPayload, PushSubscriptionRow } from "@/server/push";
import type { ExportFormat, ExportTransaction } from "@/types/export";

export const config = { maxDuration: 60 };

type DueExportJob = {
  household_id: string;
  household_name: string;
  recipient_email: string;
  export_format: ExportFormat;
  period: string;
  transaction_rows: ExportTransaction[];
};

type RecurringPushJob = {
  household_id: string;
  generated_count: number;
};

const sendHouseholdPush = async (
  supabase: SupabaseClient,
  cronSecret: string,
  householdId: string,
  payload: LedgerPushPayload
) => {
  const { data, error } = await supabase.rpc(
    "get_household_push_subscriptions",
    {
      automation_secret: cronSecret,
      target_household_id: householdId
    }
  );
  if (error) {
    throw error;
  }

  const subscriptions = (data || []) as PushSubscriptionRow[];
  const result = await sendPushNotifications(subscriptions, payload);
  for (const endpoint of result.staleEndpoints) {
    const { error: cleanupError } = await supabase.rpc(
      "remove_stale_push_subscription",
      {
        automation_secret: cronSecret,
        target_endpoint: endpoint
      }
    );
    if (cleanupError) {
      console.error("만료된 푸시 구독을 정리하지 못했습니다.", cleanupError);
    }
  }
  return { attempted: subscriptions.length, ...result };
};

const sameSecret = (provided: string | undefined, expected: string) => {
  const expectedHeader = `Bearer ${expected}`;
  if (!provided || provided.length !== expectedHeader.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expectedHeader));
};

const getConfiguration = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const cronSecret = process.env.CRON_SECRET;
  if (!url || !anonKey || !cronSecret) {
    throw new Error("Cron environment variables are missing.");
  }
  return { url, anonKey, cronSecret };
};

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse
) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ ok: false, error: "Method not allowed." });
  }

  let configuration: ReturnType<typeof getConfiguration>;
  try {
    configuration = getConfiguration();
  } catch (error) {
    console.error("자동화 환경 설정이 누락되었습니다.", error);
    return response.status(503).json({ ok: false, error: "Cron is not configured." });
  }

  if (!sameSecret(request.headers.authorization, configuration.cronSecret)) {
    return response.status(401).json({ ok: false, error: "Unauthorized." });
  }

  response.setHeader("Cache-Control", "private, no-store");
  const supabase = createClient(configuration.url, configuration.anonKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
  });

  try {
    const { data: recurringResult, error: recurringError } = await supabase.rpc(
      "run_recurring_maintenance",
      { automation_secret: configuration.cronSecret }
    );
    if (recurringError) {
      throw recurringError;
    }

    const pushResults: Array<{
      householdId: string;
      kind: "recurring" | "export_success" | "export_failure";
      attempted: number;
      sent: number;
      failed: number;
    }> = [];

    try {
      const { data: recurringPushData, error: recurringPushError } =
        await supabase.rpc("claim_recurring_push_jobs", {
          automation_secret: configuration.cronSecret
        });
      if (recurringPushError) {
        throw recurringPushError;
      }

      for (const job of (recurringPushData || []) as RecurringPushJob[]) {
        const result = await sendHouseholdPush(
          supabase,
          configuration.cronSecret,
          job.household_id,
          {
            title: "고정비 자동 입력 완료",
            body:
              Number(job.generated_count) +
              "건의 반복 거래가 가계부에 등록되었습니다.",
            url: "/transactions",
            tag: "recurring-" + new Date().toISOString().slice(0, 10)
          }
        );
        pushResults.push({
          householdId: job.household_id,
          kind: "recurring",
          attempted: result.attempted,
          sent: result.sent,
          failed: result.failed
        });
      }
    } catch (error) {
      console.error("고정비 푸시 알림 처리에 실패했습니다.", error);
    }

    const { data: dueData, error: dueError } = await supabase.rpc(
      "get_due_export_jobs",
      { automation_secret: configuration.cronSecret }
    );
    if (dueError) {
      throw dueError;
    }

    const jobs = (dueData || []) as DueExportJob[];
    const deliveries: Array<{
      householdId: string;
      period: string;
      ok: boolean;
      error?: string;
    }> = [];

    for (const job of jobs) {
      try {
        await sendExportEmail({
          householdId: job.household_id,
          recipientEmail: job.recipient_email,
          format: job.export_format,
          month: job.period,
          transactions: Array.isArray(job.transaction_rows) ? job.transaction_rows : [],
          idempotencyKey: `scheduled-ledger/${job.household_id}/${job.period}`
        });

        const { error: markError } = await supabase.rpc("mark_export_sent", {
          automation_secret: configuration.cronSecret,
          target_household_id: job.household_id,
          target_period: job.period
        });
        if (markError) {
          throw markError;
        }

        deliveries.push({
          householdId: job.household_id,
          period: job.period,
          ok: true
        });

        try {
          const push = await sendHouseholdPush(
            supabase,
            configuration.cronSecret,
            job.household_id,
            {
              title: "월간 가계부 발송 완료",
              body: job.period + " 거래내역 파일을 설정한 이메일로 보냈습니다.",
              url: "/settings",
              tag: "export-" + job.period
            }
          );
          pushResults.push({
            householdId: job.household_id,
            kind: "export_success",
            attempted: push.attempted,
            sent: push.sent,
            failed: push.failed
          });
        } catch (pushError) {
          console.error("월간 발송 완료 푸시를 보내지 못했습니다.", pushError);
        }
      } catch (error) {
        console.error(
          `월간 내역 자동 발송에 실패했습니다. household=${job.household_id} period=${job.period}`,
          error
        );
        deliveries.push({
          householdId: job.household_id,
          period: job.period,
          ok: false,
          error: error instanceof Error ? error.message : "Delivery failed."
        });

        try {
          const push = await sendHouseholdPush(
            supabase,
            configuration.cronSecret,
            job.household_id,
            {
              title: "월간 가계부 발송 확인 필요",
              body: job.period + " 거래내역 이메일을 보내지 못했습니다.",
              url: "/settings",
              tag: "export-failure-" + job.period
            }
          );
          pushResults.push({
            householdId: job.household_id,
            kind: "export_failure",
            attempted: push.attempted,
            sent: push.sent,
            failed: push.failed
          });
        } catch (pushError) {
          console.error("월간 발송 실패 푸시를 보내지 못했습니다.", pushError);
        }
      }
    }

    const failed = deliveries.filter((delivery) => !delivery.ok).length;
    return response.status(failed ? 503 : 200).json({
      ok: failed === 0,
      checkedAt: new Date().toISOString(),
      recurring: recurringResult,
      deliveries: {
        attempted: deliveries.length,
        succeeded: deliveries.length - failed,
        failed
      },
      push: {
        attempted: pushResults.reduce(
          (sum, result) => sum + result.attempted,
          0
        ),
        sent: pushResults.reduce((sum, result) => sum + result.sent, 0),
        failed: pushResults.reduce((sum, result) => sum + result.failed, 0)
      }
    });
  } catch (error) {
    console.error("일일 가계부 자동화에 실패했습니다.", error);
    return response.status(503).json({
      ok: false,
      checkedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Maintenance failed."
    });
  }
}
