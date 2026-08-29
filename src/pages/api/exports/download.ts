import type { NextApiRequest, NextApiResponse } from "next";
import {
  authenticateExportRequest,
  ExportRequestError,
  fetchHouseholdTransactions
} from "@/server/export-data";
import type { ExportFormat } from "@/types/export";
import {
  buildExportArtifact,
  exportFileName,
  exportMimeType,
  isExportMonth
} from "@/utils/export";

const isExportFormat = (value: unknown): value is ExportFormat =>
  value === "csv" || value === "xlsx";

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse
) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "GET 요청만 지원합니다." });
  }

  const month = request.query.month;
  const format = request.query.format;
  if (!isExportMonth(month) || !isExportFormat(format)) {
    return response.status(400).json({
      error: "month는 YYYY-MM, format은 csv 또는 xlsx로 입력해 주세요."
    });
  }

  try {
    const { supabase, householdId } = await authenticateExportRequest(request);
    const transactions = await fetchHouseholdTransactions(
      supabase,
      householdId,
      month
    );
    const artifact = await buildExportArtifact(transactions, month, format);

    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Content-Type", exportMimeType(format));
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${exportFileName(month, format)}"`
    );
    response.setHeader("Content-Length", String(artifact.byteLength));
    return response.status(200).send(artifact);
  } catch (error) {
    if (error instanceof ExportRequestError) {
      return response
        .status(error.statusCode)
        .json({ error: error.message, code: error.code });
    }

    console.error("거래내역 파일 생성에 실패했습니다.", error);
    return response.status(500).json({ error: "파일을 생성하지 못했습니다." });
  }
}
