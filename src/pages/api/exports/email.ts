import type { NextApiRequest, NextApiResponse } from "next";
import {
  authenticateExportRequest,
  ExportRequestError,
  fetchExportSchedule,
  fetchHouseholdTransactions
} from "@/server/export-data";
import {
  ExportEmailConfigurationError,
  ExportEmailDeliveryError,
  sendExportEmail
} from "@/server/export-email";
import { isExportMonth, previousKoreaMonthKey } from "@/utils/export";

export const config = { maxDuration: 60 };

const requestIdPattern = /^[A-Za-z0-9_-]{8,80}$/;

const getRequestId = (request: NextApiRequest) => {
  const header = request.headers["idempotency-key"];
  if (header === undefined) {
    return crypto.randomUUID();
  }
  if (typeof header !== "string" || !requestIdPattern.test(header)) {
    throw new ExportRequestError(
      400,
      "중복 방지 요청 키가 올바르지 않습니다.",
      "invalid_idempotency_key"
    );
  }
  return header;
};

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse
) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "POST 요청만 지원합니다." });
  }

  const requestedMonth = request.body?.month;
  const month = requestedMonth === undefined ? previousKoreaMonthKey() : requestedMonth;
  if (!isExportMonth(month)) {
    return response.status(400).json({ error: "month는 YYYY-MM 형식이어야 합니다." });
  }

  try {
    const requestId = getRequestId(request);
    const { supabase, householdId } = await authenticateExportRequest(request);
    const schedule = await fetchExportSchedule(supabase, householdId);
    if (!schedule) {
      return response.status(409).json({
        error: "먼저 받을 이메일과 파일 형식을 저장해 주세요.",
        code: "schedule_required"
      });
    }

    const transactions = await fetchHouseholdTransactions(
      supabase,
      householdId,
      month
    );
    const result = await sendExportEmail({
      householdId,
      recipientEmail: schedule.recipientEmail,
      format: schedule.format,
      month,
      transactions,
      idempotencyKey: `manual-ledger/${householdId}/${month}/${requestId}`
    });

    return response.status(200).json({
      ok: true,
      id: result.id,
      month,
      recipientEmail: schedule.recipientEmail
    });
  } catch (error) {
    if (error instanceof ExportRequestError) {
      return response
        .status(error.statusCode)
        .json({ error: error.message, code: error.code });
    }
    if (error instanceof ExportEmailConfigurationError) {
      console.error("이메일 전송 환경 설정이 누락되었습니다.", {
        message: error.message,
        providerCode: error.providerCode,
        providerStatus: error.providerStatus
      });
      return response.status(503).json({
        error: "메일 전송 설정이 아직 완료되지 않았습니다.",
        code: "email_not_configured"
      });
    }
    if (error instanceof ExportEmailDeliveryError) {
      console.error("거래내역 이메일 전송에 실패했습니다.", {
        message: error.message,
        providerCode: error.providerCode,
        providerStatus: error.providerStatus
      });
      return response.status(502).json({
        error: "메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.",
        code: "email_delivery_failed"
      });
    }

    console.error("거래내역 이메일 처리에 실패했습니다.", error);
    return response.status(500).json({ error: "메일 요청을 처리하지 못했습니다." });
  }
}
