import { getSupabaseClient } from "@/services/supabase";
import {
  cacheTransaction,
  completeQueuedTransaction,
  getCachedTransaction,
  getCachedTransactions,
  getQueuedTransactionCreates,
  incrementQueuedTransactionAttempts,
  queueTransactionCreate,
  removeCachedTransaction,
  replaceCachedTransactions
} from "@/services/offline-storage";
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

const isBrowserOffline = () =>
  typeof navigator !== "undefined" && navigator.onLine === false;

const isNetworkFailure = (error: unknown) => {
  if (isBrowserOffline() || error instanceof TypeError) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return [
    "failed to fetch",
    "networkerror",
    "network request failed",
    "load failed"
  ].some((candidate) => message.includes(candidate));
};

export const getOfflineScope = async () => {
  if (
    typeof window === "undefined" ||
    typeof window.indexedDB === "undefined"
  ) {
    return null;
  }

  try {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error) {
      return null;
    }
    return data.session?.user.id || null;
  } catch {
    return null;
  }
};

export class OfflineMutationError extends Error {
  constructor() {
    super("거래 수정과 삭제는 인터넷에 연결된 상태에서만 가능합니다.");
    this.name = "OfflineMutationError";
  }
}

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

const fetchTransactionById = async (id: string) => {
  const { data, error } = await getSupabaseClient()
    .from("transactions")
    .select(TRANSACTION_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data ? toTransaction(data as TransactionRow) : null;
};

const insertTransactionById = async (
  id: string,
  transaction: TransactionInput
) => {
  const { data, error } = await getSupabaseClient()
    .from("transactions")
    .insert(toRow(transaction, id))
    .select(TRANSACTION_COLUMNS)
    .single();

  if (error) {
    throw error;
  }
  return toTransaction(data as TransactionRow);
};

const sameTransaction = (left: Transaction, right: Transaction) =>
  left.id === right.id &&
  left.type === right.type &&
  left.paymentMethod === right.paymentMethod &&
  left.inputter === right.inputter &&
  left.category === right.category &&
  left.amount === right.amount &&
  left.memo === right.memo &&
  left.date === right.date;

export const getTransactions = async (range?: TransactionDateRange) => {
  const scope = await getOfflineScope();

  try {
    const supabase = getSupabaseClient();
    const transactions: Transaction[] = [];

    for (let from = 0; ; from += TRANSACTION_PAGE_SIZE) {
      let request = supabase
        .from("transactions")
        .select(TRANSACTION_COLUMNS)
        .order("date", { ascending: false })
        .order("id", { ascending: false });

      if (range) {
        request = request
          .gte("date", range.startDate)
          .lt("date", range.endDateExclusive);
      }

      const { data, error } = await request.range(
        from,
        from + TRANSACTION_PAGE_SIZE - 1
      );

      if (error) {
        throw error;
      }

      const page = (data || []).map((row) =>
        toTransaction(row as TransactionRow)
      );
      transactions.push(...page);

      if (page.length < TRANSACTION_PAGE_SIZE) {
        break;
      }
    }

    if (!scope) {
      return transactions;
    }

    await replaceCachedTransactions(scope, range, transactions);
    return getCachedTransactions(scope, range);
  } catch (error) {
    if (scope && (isBrowserOffline() || isNetworkFailure(error))) {
      return getCachedTransactions(scope, range);
    }
    throw error;
  }
};

export const getTransaction = async (id: string) => {
  const scope = await getOfflineScope();
  if (scope && isBrowserOffline()) {
    return getCachedTransaction(scope, id);
  }

  try {
    const transaction = await fetchTransactionById(id);
    if (scope && transaction) {
      await cacheTransaction(scope, transaction);
    }
    return transaction;
  } catch (error) {
    if (scope && isNetworkFailure(error)) {
      return getCachedTransaction(scope, id);
    }
    throw error;
  }
};

export const createTransaction = async (transaction: TransactionInput) => {
  const id = crypto.randomUUID();
  const scope = await getOfflineScope();
  const pending = toTransaction(toRow(transaction, id));

  if (scope && isBrowserOffline()) {
    return queueTransactionCreate(scope, pending);
  }

  try {
    const created = await insertTransactionById(id, transaction);
    if (scope) {
      await cacheTransaction(scope, created);
    }
    return created;
  } catch (error) {
    if (scope && isNetworkFailure(error)) {
      return queueTransactionCreate(scope, pending);
    }
    throw error;
  }
};

export const updateTransaction = async (id: string, transaction: TransactionInput) => {
  if (isBrowserOffline()) {
    throw new OfflineMutationError();
  }

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

  const updated = toTransaction(data as TransactionRow);
  const scope = await getOfflineScope();
  if (scope) {
    await cacheTransaction(scope, updated);
  }
  return updated;
};

export const deleteTransaction = async (id: string) => {
  if (isBrowserOffline()) {
    throw new OfflineMutationError();
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.from("transactions").delete().eq("id", id);

  if (error) {
    throw error;
  }
  const scope = await getOfflineScope();
  if (scope) {
    await removeCachedTransaction(scope, id);
  }
};

export const flushTransactionOutbox = async () => {
  const scope = await getOfflineScope();
  if (!scope || isBrowserOffline()) {
    return { synced: 0, remaining: scope ? undefined : 0 };
  }

  const queued = await getQueuedTransactionCreates(scope);
  let synced = 0;

  for (const item of queued) {
    const { id: _id, syncStatus: _syncStatus, ...input } = item.transaction;

    try {
      let saved: Transaction;
      try {
        saved = await insertTransactionById(item.id, input);
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? String(error.code)
            : "";
        if (code !== "23505") {
          throw error;
        }

        const existing = await fetchTransactionById(item.id);
        if (!existing || !sameTransaction(existing, item.transaction)) {
          throw new Error("동일한 거래 ID에 다른 데이터가 있어 동기화하지 못했습니다.");
        }
        saved = existing;
      }

      await completeQueuedTransaction(scope, saved);
      synced += 1;
    } catch (error) {
      await incrementQueuedTransactionAttempts(item.id);
      if (!isNetworkFailure(error)) {
        console.error("오프라인 거래를 동기화하지 못했습니다.", error);
      }
      break;
    }
  }

  return {
    synced,
    remaining: queued.length - synced
  };
};

export const getCategories = async () => DEFAULT_CATEGORIES;
