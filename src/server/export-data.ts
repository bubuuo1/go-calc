import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest } from "next";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type {
  ExportFormat,
  ExportSchedule,
  ExportTransaction
} from "@/types/export";

const PAGE_SIZE = 1000;
const TRANSACTION_COLUMNS =
  "id,type,payment_method,inputter,category,amount,memo,date";

type MemberRow = {
  household_id: string;
};

type TransactionRow = {
  id: string;
  type: ExportTransaction["type"];
  payment_method: ExportTransaction["paymentMethod"];
  inputter: ExportTransaction["inputter"];
  category: string;
  amount: number | string;
  memo: string | null;
  date: string;
};

type ExportScheduleRow = {
  household_id: string;
  recipient_email: string;
  format: ExportFormat;
  send_day: number;
  active: boolean;
  timezone: string;
  last_sent_period: string | null;
};

export class ExportRequestError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "ExportRequestError";
  }
}

export type AuthenticatedExportContext = {
  supabase: SupabaseClient;
  user: User;
  householdId: string;
};

const getBearerToken = (request: NextApiRequest) => {
  const authorization = request.headers.authorization;
  if (
    typeof authorization !== "string" ||
    !authorization.startsWith("Bearer ")
  ) {
    throw new ExportRequestError(401, "로그인이 필요합니다.", "unauthorized");
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token || token.length > 8192) {
    throw new ExportRequestError(401, "로그인이 필요합니다.", "unauthorized");
  }

  return token;
};

const createAuthorizedSupabase = (accessToken: string) => {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new ExportRequestError(
      500,
      "서버 데이터 연결 설정이 누락되었습니다.",
      "server_misconfigured"
    );
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  });
};

export const authenticateExportRequest = async (
  request: NextApiRequest
): Promise<AuthenticatedExportContext> => {
  const accessToken = getBearerToken(request);
  const supabase = createAuthorizedSupabase(accessToken);
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser(accessToken);

  if (authError || !user) {
    throw new ExportRequestError(
      401,
      "로그인이 만료되었습니다. 다시 로그인해 주세요.",
      "invalid_session"
    );
  }

  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new ExportRequestError(
      500,
      "공유공간 정보를 확인하지 못했습니다.",
      "membership_lookup_failed"
    );
  }

  const member = data as MemberRow | null;
  if (!member) {
    throw new ExportRequestError(
      403,
      "먼저 공유공간 설정을 완료해 주세요.",
      "membership_required"
    );
  }

  return { supabase, user, householdId: member.household_id };
};

const toExportTransaction = (row: TransactionRow): ExportTransaction => ({
  id: row.id,
  type: row.type,
  paymentMethod: row.payment_method,
  inputter: row.inputter,
  category: row.category,
  amount: Number(row.amount),
  memo: row.memo || "",
  date: row.date
});

export const fetchHouseholdTransactions = async (
  supabase: SupabaseClient,
  householdId: string,
  month: string
) => {
  const transactions: ExportTransaction[] = [];
  const startDate = `${month}-01`;
  const [year, monthNumber] = month.split("-").map(Number);
  const nextMonth = new Date(Date.UTC(year, monthNumber, 1));
  const endDateExclusive = `${nextMonth.getUTCFullYear()}-${String(
    nextMonth.getUTCMonth() + 1
  ).padStart(2, "0")}-01`;

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("transactions")
      .select(TRANSACTION_COLUMNS)
      .eq("household_id", householdId)
      .gte("date", startDate)
      .lt("date", endDateExclusive)
      .order("date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new ExportRequestError(
        500,
        "거래내역을 불러오지 못했습니다.",
        "transactions_lookup_failed"
      );
    }

    const page = (data || []).map((row) =>
      toExportTransaction(row as TransactionRow)
    );
    transactions.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }
  }

  return transactions;
};

export const fetchExportSchedule = async (
  supabase: SupabaseClient,
  householdId: string
) => {
  const { data, error } = await supabase
    .from("export_schedules")
    .select(
      "household_id,recipient_email,format,send_day,active,timezone,last_sent_period"
    )
    .eq("household_id", householdId)
    .maybeSingle();

  if (error) {
    throw new ExportRequestError(
      500,
      "이메일 설정을 불러오지 못했습니다.",
      "schedule_lookup_failed"
    );
  }

  if (!data) {
    return null;
  }

  const row = data as ExportScheduleRow;
  if (
    (row.format !== "csv" && row.format !== "xlsx") ||
    row.timezone !== "Asia/Seoul"
  ) {
    throw new ExportRequestError(
      500,
      "저장된 이메일 설정이 올바르지 않습니다.",
      "invalid_schedule"
    );
  }

  return {
    householdId: row.household_id,
    recipientEmail: row.recipient_email,
    format: row.format,
    sendDay: row.send_day,
    active: row.active,
    timezone: row.timezone,
    lastSentPeriod: row.last_sent_period
  } satisfies ExportSchedule;
};
