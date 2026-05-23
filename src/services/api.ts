import { createClient } from "@supabase/supabase-js";
import type { Transaction, TransactionInput } from "@/types/transaction";

type TransactionRow = {
  id: string;
  type: Transaction["type"];
  payment_method: Transaction["paymentMethod"];
  category: string;
  amount: number;
  memo: string;
  date: string;
};

const DEFAULT_CATEGORIES = [
  "식비",
  "교통",
  "쇼핑",
  "주거",
  "통신",
  "의료",
  "교육",
  "문화",
  "급여",
  "기타"
];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const getSupabase = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return createClient(supabaseUrl, supabaseAnonKey);
};

const toTransaction = (row: TransactionRow): Transaction => ({
  id: row.id,
  type: row.type,
  paymentMethod: row.payment_method,
  category: row.category,
  amount: Number(row.amount),
  memo: row.memo || "",
  date: row.date
});

const toRow = (transaction: TransactionInput, id: string): TransactionRow => ({
  id,
  type: transaction.type,
  payment_method: transaction.paymentMethod,
  category: transaction.category,
  amount: Number(transaction.amount),
  memo: transaction.memo || "",
  date: transaction.date
});

export const getTransactions = async () => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("transactions")
    .select("id,type,payment_method,category,amount,memo,date")
    .order("date", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map((row) => toTransaction(row as TransactionRow));
};

export const createTransaction = async (transaction: TransactionInput) => {
  const supabase = getSupabase();
  const id = crypto.randomUUID();
  const { data, error } = await supabase
    .from("transactions")
    .insert(toRow(transaction, id))
    .select("id,type,payment_method,category,amount,memo,date")
    .single();

  if (error) {
    throw error;
  }

  return toTransaction(data as TransactionRow);
};

export const updateTransaction = async (id: string, transaction: TransactionInput) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("transactions")
    .update(toRow(transaction, id))
    .eq("id", id)
    .select("id,type,payment_method,category,amount,memo,date")
    .single();

  if (error) {
    throw error;
  }

  return toTransaction(data as TransactionRow);
};

export const deleteTransaction = async (id: string) => {
  const supabase = getSupabase();
  const { error } = await supabase.from("transactions").delete().eq("id", id);

  if (error) {
    throw error;
  }
};

export const getCategories = async () => DEFAULT_CATEGORIES;
