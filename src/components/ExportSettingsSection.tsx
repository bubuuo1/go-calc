import { useEffect, useState } from "react";
import {
  downloadTransactionsExport,
  emailTransactionsExport,
  getExportSchedule,
  saveExportSchedule
} from "@/services/export";
import type { ExportFormat, ExportScheduleInput } from "@/types/export";
import {
  isExportMonth,
  isExportSendDay,
  previousKoreaMonthKey
} from "@/utils/export-shared";

type StatusMessage = {
  tone: "success" | "error";
  text: string;
};

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export default function ExportSettingsSection({
  householdId
}: {
  householdId: string;
}) {
  const [recipientEmail, setRecipientEmail] = useState("");
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [sendDay, setSendDay] = useState(1);
  const [active, setActive] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() =>
    previousKoreaMonthKey()
  );
  const [lastSentPeriod, setLastSentPeriod] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);

  useEffect(() => {
    let activeRequest = true;
    setRecipientEmail("");
    setFormat("xlsx");
    setSendDay(1);
    setActive(false);
    setLastSentPeriod(null);
    setLoading(true);
    setStatus(null);

    void getExportSchedule(householdId)
      .then((schedule) => {
        if (!activeRequest || !schedule) {
          return;
        }

        setRecipientEmail(schedule.recipientEmail);
        setFormat(schedule.format);
        setSendDay(schedule.sendDay);
        setActive(schedule.active);
        setLastSentPeriod(schedule.lastSentPeriod);
      })
      .catch((error) => {
        if (activeRequest) {
          setStatus({
            tone: "error",
            text: errorMessage(error, "이메일 설정을 불러오지 못했습니다.")
          });
        }
      })
      .finally(() => {
        if (activeRequest) {
          setLoading(false);
        }
      });

    return () => {
      activeRequest = false;
    };
  }, [householdId]);

  const scheduleInput = (): ExportScheduleInput => ({
    recipientEmail: recipientEmail.trim(),
    format,
    sendDay,
    active
  });

  const validateEmailSettings = () => {
    if (!recipientEmail.trim()) {
      setStatus({ tone: "error", text: "받을 이메일을 입력해 주세요." });
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim())) {
      setStatus({ tone: "error", text: "이메일 주소 형식을 확인해 주세요." });
      return false;
    }
    if (!isExportSendDay(sendDay)) {
      setStatus({ tone: "error", text: "발송일은 1일부터 31일까지 선택해 주세요." });
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateEmailSettings()) {
      return;
    }

    setBusyAction("save");
    setStatus(null);
    try {
      const schedule = await saveExportSchedule(householdId, scheduleInput());
      setLastSentPeriod(schedule.lastSentPeriod);
      setStatus({ tone: "success", text: "이메일 발송 설정을 저장했습니다." });
    } catch (error) {
      setStatus({
        tone: "error",
        text: errorMessage(error, "이메일 설정을 저장하지 못했습니다.")
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownload = async (downloadFormat: ExportFormat) => {
    if (!isExportMonth(selectedMonth)) {
      setStatus({ tone: "error", text: "내보낼 달을 선택해 주세요." });
      return;
    }

    setBusyAction(`download-${downloadFormat}`);
    setStatus(null);
    try {
      await downloadTransactionsExport(selectedMonth, downloadFormat);
      setStatus({
        tone: "success",
        text: `${selectedMonth} ${downloadFormat.toUpperCase()} 파일을 내려받았습니다.`
      });
    } catch (error) {
      setStatus({
        tone: "error",
        text: errorMessage(error, "파일을 내려받지 못했습니다.")
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleEmail = async () => {
    if (!isExportMonth(selectedMonth)) {
      setStatus({ tone: "error", text: "메일로 보낼 달을 선택해 주세요." });
      return;
    }
    if (!validateEmailSettings()) {
      return;
    }

    setBusyAction("email");
    setStatus(null);
    try {
      const schedule = await saveExportSchedule(householdId, scheduleInput());
      setLastSentPeriod(schedule.lastSentPeriod);
      const result = await emailTransactionsExport(selectedMonth);
      setStatus({
        tone: "success",
        text: `${result.recipientEmail}로 ${result.month} 내역을 보냈습니다.`
      });
    } catch (error) {
      setStatus({
        tone: "error",
        text: errorMessage(error, "메일을 보내지 못했습니다.")
      });
    } finally {
      setBusyAction(null);
    }
  };

  const busy = loading || busyAction !== null;

  return (
    <section className="panel p-4 sm:p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <p className="text-xs font-black tracking-[0.14em] text-blue-600">
            내보내기 · 이메일
          </p>
          <h2 className="mt-1 text-lg font-black text-slate-950">
            월별 내역을 파일로 보관하세요
          </h2>
          <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
            CSV 또는 Excel 파일로 받고, 매월 지정한 날에 전월 내역을 자동 발송할 수 있어요.
          </p>
        </div>
        {lastSentPeriod ? (
          <span className="mt-2 w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700 sm:mt-0">
            최근 자동 발송 {lastSentPeriod}
          </span>
        ) : null}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <label className="text-sm font-black text-slate-800" htmlFor="export-month">
            내보낼 달
          </label>
          <input
            className="input mt-2"
            disabled={busy}
            id="export-month"
            max="9999-12"
            min="2000-01"
            type="month"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              className="btn-secondary"
              disabled={busy || !selectedMonth}
              type="button"
              onClick={() => void handleDownload("csv")}
            >
              {busyAction === "download-csv" ? "생성 중…" : "CSV 받기"}
            </button>
            <button
              className="btn-primary"
              disabled={busy || !selectedMonth}
              type="button"
              onClick={() => void handleDownload("xlsx")}
            >
              {busyAction === "download-xlsx" ? "생성 중…" : "Excel 받기"}
            </button>
          </div>
          <p className="mt-3 text-xs font-bold leading-5 text-slate-500">
            CSV는 UTF-8 형식이며 Excel에서도 한글이 깨지지 않아요. Excel 파일은 날짜와 금액 셀 형식을 유지합니다.
          </p>
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
          <label className="text-sm font-black text-slate-800" htmlFor="export-email">
            받을 이메일
          </label>
          <input
            autoComplete="email"
            className="input mt-2"
            disabled={busy}
            id="export-email"
            placeholder="name@example.com"
            required
            type="email"
            value={recipientEmail}
            onChange={(event) => setRecipientEmail(event.target.value)}
          />

          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-sm font-black text-slate-800" htmlFor="export-format">
              첨부 형식
              <select
                className="input mt-2"
                disabled={busy}
                id="export-format"
                value={format}
                onChange={(event) => setFormat(event.target.value as ExportFormat)}
              >
                <option value="xlsx">Excel (.xlsx)</option>
                <option value="csv">CSV (.csv)</option>
              </select>
            </label>
            <label className="text-sm font-black text-slate-800" htmlFor="export-send-day">
              전월 내역 발송일
              <input
                className="input mt-2"
                disabled={busy}
                id="export-send-day"
                max={31}
                min={1}
                type="number"
                value={sendDay}
                onChange={(event) => setSendDay(Number(event.target.value))}
              />
            </label>
          </div>
          <p className="mt-3 text-xs font-bold leading-5 text-slate-500">
            선택한 날짜가 없는 달에는 다음 달 1일에 발송해요.
          </p>

          <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm font-black text-slate-800">
            <input
              checked={active}
              className="h-5 w-5 accent-blue-600"
              disabled={busy}
              type="checkbox"
              onChange={(event) => setActive(event.target.checked)}
            />
            매월 자동 이메일 발송 사용
          </label>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              className="btn-secondary"
              disabled={busy}
              type="button"
              onClick={() => void handleSave()}
            >
              {busyAction === "save" ? "저장 중…" : "발송 설정 저장"}
            </button>
            <button
              className="btn-primary"
              disabled={busy || !selectedMonth}
              type="button"
              onClick={() => void handleEmail()}
            >
              {busyAction === "email" ? "보내는 중…" : "선택한 달 메일 보내기"}
            </button>
          </div>
        </div>
      </div>

      {status ? (
        <p
          aria-live="polite"
          className={`mt-4 rounded-xl border px-3 py-2 text-sm font-bold ${
            status.tone === "success"
              ? "border-blue-200 bg-blue-50 text-blue-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
          role={status.tone === "error" ? "alert" : "status"}
        >
          {status.text}
        </p>
      ) : null}
    </section>
  );
}
