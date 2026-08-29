import { getSupabaseClient } from "@/services/supabase";
import type { Transaction, TransactionInput } from "@/types/transaction";
import { DEFAULT_CATEGORIES } from "@/utils/ledger";
import type { TransactionDateRange } from "@/utils/month";

type TransactionRow = {
  id: string;
  type: Transaction["type"];
  payment_method: Transaction["paymentMethod"];
  inputter?: Transaction["inputter"] | null;
  category: string;
  amount: number;
  memo: string;
  date: string;
};

const TRANSACTION_COLUMNS = "id,type,payment_method,inputter,category,amount,memo,date";
const TRANSACTION_PAGE_SIZE = 1000;

const toTransaction = (row: TransactionRow): Transaction => ({
  id: row.id,
  type: row.type,
  paymentMethod: row.payment_method,
  inputter: row.inputter || "husband",
  category: row.category,
  amount: Number(row.amount),
  memo: row.memo || "",
  date: row.date
});

const toRow = (transaction: TransactionInput, id: string): TransactionRow => ({
  id,
  type: transaction.type,
  payment_method: transaction.paymentMethod,
  inputter: transaction.inputter,
  category: transaction.category,
  amount: Number(transaction.amount),
  memo: transaction.memo || "",
  date: transaction.date
});

export const getTransactions = async (range?: TransactionDateRange) => {
  const supabase = getSupabaseClient();
  const transactions: Transaction[] = [];

  for (let from = 0; ; from += TRANSACTION_PAGE_SIZE) {
    let request = supabase
      .from("transactions")
      .select(TRANSACTION_COLUMNS)
      .order("date", { ascending: false })
      .order("id", { ascending: false });

    if (range) {
      request = request.gte("date", range.startDate).lt("date", range.endDateExclusive);
    }

    const { data, error } = await request.range(
      from,
      from + TRANSACTION_PAGE_SIZE - 1
    );

    if (error) {
      throw error;
    }

    const page = (data || []).map((row) => toTransaction(row as TransactionRow));
    transactions.push(...page);

    if (page.length < TRANSACTION_PAGE_SIZE) {
      break;
    }
  }

  return transactions;
};

export const getTransaction = async (id: string) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(TRANSACTION_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? toTransaction(data as TransactionRow) : null;
};

export const createTransaction = async (transaction: TransactionInput) => {
  const supabase = getSupabaseClient();
  const id = crypto.randomUUID();
  const { data, error } = await supabase
    .from("transactions")
    .insert(toRow(transaction, id))
    .select(TRANSACTION_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  return toTransaction(data as TransactionRow);
};

export const updateTransaction = async (id: string, transaction: TransactionInput) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("transactions")
    .update(toRow(transaction, id))
    .eq("id", id)
    .select(TRANSACTION_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  return toTransaction(data as TransactionRow);
};

export const deleteTransaction = async (id: string) => {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("transactions").delete().eq("id", id);

  if (error) {
    throw error;
  }

};

export const getCategories = async () => DEFAULT_CATEGORIES;
