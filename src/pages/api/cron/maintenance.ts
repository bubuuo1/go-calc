import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";
import { sendExportEmail } from "@/server/export-email";
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
