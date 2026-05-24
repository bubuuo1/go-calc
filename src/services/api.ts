import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Transaction, TransactionInput } from "@/types/transaction";
import { DEFAULT_CATEGORIES } from "@/utils/ledger";

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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let supabaseClient: SupabaseClient | null = null;
let transactionCache: Transaction[] | null = null;

const getSupabase = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  supabaseClient = supabaseClient || createClient(supabaseUrl, supabaseAnonKey);
  return supabaseClient;
};

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

const sortTransactions = (transactions: Transaction[]) =>
  [...transactions].sort((left, right) => {
    const dateOrder = right.date.localeCompare(left.date);
    return dateOrder || right.id.localeCompare(left.id);
  });

export const getTransactions = async () => {
  if (transactionCache) {
    return transactionCache;
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("transactions")
    .select("id,type,payment_method,inputter,category,amount,memo,date")
    .order("date", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    throw error;
  }

  transactionCache = (data || []).map((row) => toTransaction(row as TransactionRow));
  return transactionCache;
};

export const createTransaction = async (transaction: TransactionInput) => {
  const supabase = getSupabase();
  const id = crypto.randomUUID();
  const { data, error } = await supabase
    .from("transactions")
    .insert(toRow(transaction, id))
    .select("id,type,payment_method,inputter,category,amount,memo,date")
    .single();

  if (error) {
    throw error;
  }

  const createdTransaction = toTransaction(data as TransactionRow);
  transactionCache = transactionCache
    ? sortTransactions([createdTransaction, ...transactionCache])
    : null;
  return createdTransaction;
};

export const updateTransaction = async (id: string, transaction: TransactionInput) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("transactions")
    .update(toRow(transaction, id))
    .eq("id", id)
    .select("id,type,payment_method,inputter,category,amount,memo,date")
    .single();

  if (error) {
    throw error;
  }

  const updatedTransaction = toTransaction(data as TransactionRow);
  transactionCache = transactionCache
    ? sortTransactions(
        transactionCache.map((transaction) =>
          transaction.id === updatedTransaction.id ? updatedTransaction : transaction
        )
      )
    : null;
  return updatedTransaction;
};

export const deleteTransaction = async (id: string) => {
  const supabase = getSupabase();
  const { error } = await supabase.from("transactions").delete().eq("id", id);

  if (error) {
    throw error;
  }

  transactionCache = transactionCache
    ? transactionCache.filter((transaction) => transaction.id !== id)
    : null;
};

export const getCategories = async () => DEFAULT_CATEGORIES;
