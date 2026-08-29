import { getSupabaseClient } from "@/services/supabase";
import type {
  RecurringRule,
  RecurringRuleInput,
  RecurringRuleUpdate
} from "@/types/recurring";

type RecurringRuleRow = {
  id: string;
  household_id: string;
  type: RecurringRule["type"];
  payment_method: RecurringRule["paymentMethod"];
  inputter: RecurringRule["inputter"];
  category: string;
  amount: number | string;
  memo: string | null;
  day_of_month: number;
  start_date: string;
  end_date: string | null;
  next_due_date: string;
  active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type RecurringRuleMutationRow = {
  type?: RecurringRuleInput["type"];
  payment_method?: RecurringRuleInput["paymentMethod"];
  inputter?: RecurringRuleInput["inputter"];
  category?: string;
  amount?: number;
  memo?: string;
  day_of_month?: number;
  start_date?: string;
  end_date?: string | null;
  active?: boolean;
};

const RECURRING_RULE_COLUMNS =
  "id,household_id,type,payment_method,inputter,category,amount,memo,day_of_month,start_date,end_date,next_due_date,active,created_by,created_at,updated_at";

const toRecurringRule = (row: RecurringRuleRow): RecurringRule => ({
  id: row.id,
  householdId: row.household_id,
  type: row.type,
  paymentMethod: row.payment_method,
  inputter: row.inputter,
  category: row.category,
  amount: Number(row.amount),
  memo: row.memo || "",
  dayOfMonth: Number(row.day_of_month),
  startDate: row.start_date,
  endDate: row.end_date,
  nextDueDate: row.next_due_date,
  active: row.active,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const toMutationRow = (
  input: RecurringRuleInput | RecurringRuleUpdate
): RecurringRuleMutationRow => {
  const row: RecurringRuleMutationRow = {};

  if (input.type !== undefined) row.type = input.type;
  if (input.paymentMethod !== undefined) row.payment_method = input.paymentMethod;
  if (input.inputter !== undefined) row.inputter = input.inputter;
  if (input.category !== undefined) row.category = input.category;
  if (input.amount !== undefined) row.amount = Number(input.amount);
  if (input.memo !== undefined) row.memo = input.memo;
  if (input.dayOfMonth !== undefined) row.day_of_month = input.dayOfMonth;
  if (input.startDate !== undefined) row.start_date = input.startDate;
  if (input.endDate !== undefined) row.end_date = input.endDate;
  if (input.active !== undefined) row.active = input.active;

  return row;
};

const getCurrentHouseholdIdentity = async () => {
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("로그인이 필요합니다.");

  const { data: membership, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) throw new Error("공유공간 설정을 먼저 완료해 주세요.");

  return {
    householdId: String(membership.household_id),
    userId: user.id
  };
};

export const getRecurringRules = async (): Promise<RecurringRule[]> => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("recurring_rules")
    .select(RECURRING_RULE_COLUMNS)
    .order("active", { ascending: false })
    .order("day_of_month", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []).map((row) => toRecurringRule(row as RecurringRuleRow));
};

export const createRecurringRule = async (
  input: RecurringRuleInput
): Promise<RecurringRule> => {
  const supabase = getSupabaseClient();
  const { householdId, userId } = await getCurrentHouseholdIdentity();
  const { data, error } = await supabase
    .from("recurring_rules")
    .insert({
      ...toMutationRow(input),
      household_id: householdId,
      created_by: userId
    })
    .select(RECURRING_RULE_COLUMNS)
    .single();

  if (error) throw error;
  return toRecurringRule(data as RecurringRuleRow);
};

export const updateRecurringRule = async (
  id: string,
  changes: RecurringRuleUpdate
): Promise<RecurringRule> => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("recurring_rules")
    .update(toMutationRow(changes))
    .eq("id", id)
    .select(RECURRING_RULE_COLUMNS)
    .single();

  if (error) throw error;
  return toRecurringRule(data as RecurringRuleRow);
};

export const deleteRecurringRule = async (id: string): Promise<void> => {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("recurring_rules").delete().eq("id", id);
  if (error) throw error;
};
