import { getSupabaseBrowserClient } from "@/services/supabase";
import type {
  ExportFormat,
  ExportSchedule,
  ExportScheduleInput
} from "@/types/export";

type ExportScheduleRow = {
  household_id: string;
  recipient_email: string;
  format: ExportFormat;
  send_day: number;
  active: boolean;
  timezone: "Asia/Seoul";
  last_sent_period: string | null;
};

const SCHEDULE_COLUMNS =
  "household_id,recipient_email,format,send_day,active,timezone,last_sent_period";

const toExportSchedule = (row: ExportScheduleRow): ExportSchedule => ({
  householdId: row.household_id,
  recipientEmail: row.recipient_email,
  format: row.format,
  sendDay: row.send_day,
  active: row.active,
  timezone: row.timezone,
  lastSentPeriod: row.last_sent_period
});

const getAccessToken = async () => {
  const { data, error } = await getSupabaseBrowserClient().auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("로그인이 만료되었습니다. 다시 로그인해 주세요.");
  }

  return data.session.access_token;
};

const responseErrorMessage = async (response: Response) => {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error) {
      return body.error;
    }
  } catch {
    // JSON이 아닌 오류 응답은 상태 코드 기반 안내로 처리한다.
  }

  return `요청을 처리하지 못했습니다. (${response.status})`;
};

export const getExportSchedule = async (householdId: string) => {
  const { data, error } = await getSupabaseBrowserClient()
    .from("export_schedules")
    .select(SCHEDULE_COLUMNS)
    .eq("household_id", householdId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? toExportSchedule(data as ExportScheduleRow) : null;
};

export const saveExportSchedule = async (
  householdId: string,
  input: ExportScheduleInput
) => {
  const { data, error } = await getSupabaseBrowserClient()
    .from("export_schedules")
    .upsert(
      {
        household_id: householdId,
        recipient_email: input.recipientEmail.trim(),
        format: input.format,
        send_day: input.sendDay,
        active: input.active,
        timezone: "Asia/Seoul",
        updated_at: new Date().toISOString()
      },
      { onConflict: "household_id" }
    )
    .select(SCHEDULE_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  return toExportSchedule(data as ExportScheduleRow);
};

export const downloadTransactionsExport = async (
  month: string,
  format: ExportFormat
) => {
  const accessToken = await getAccessToken();
  const response = await fetch(
    `/api/exports/download?month=${encodeURIComponent(month)}&format=${format}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      method: "GET"
    }
  );

  if (!response.ok) {
    throw new Error(await responseErrorMessage(response));
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `solsaem-ledger-${month}.${format}`;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
};

const createRequestId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
};

export const emailTransactionsExport = async (month: string) => {
  const accessToken = await getAccessToken();
  const response = await fetch("/api/exports/email", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Idempotency-Key": createRequestId()
    },
    body: JSON.stringify({ month })
  });

  if (!response.ok) {
    throw new Error(await responseErrorMessage(response));
  }

  return (await response.json()) as {
    ok: true;
    id: string;
    month: string;
    recipientEmail: string;
  };
};
