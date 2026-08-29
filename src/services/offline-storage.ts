import type { HouseholdMembership } from "@/types/household";
import type { Transaction } from "@/types/transaction";

const DATABASE_NAME = "solsaem-ledger-pwa";
const DATABASE_VERSION = 1;
const TRANSACTION_STORE = "transactions";
const OUTBOX_STORE = "transaction_outbox";
const MEMBERSHIP_STORE = "memberships";
const META_STORE = "meta";

type CachedTransactionRecord = {
  key: string;
  scope: string;
  date: string;
  transaction: Transaction;
  cachedAt: string;
};

export type QueuedTransactionCreate = {
  id: string;
  scope: string;
  transaction: Transaction;
  createdAt: string;
  attempts: number;
};

type MembershipRecord = {
  userId: string;
  membership: HouseholdMembership;
  cachedAt: string;
};

type MetaRecord = {
  key: string;
  value: string;
};

export type OfflineDateRange = {
  startDate: string;
  endDateExclusive: string;
};

let databasePromise: Promise<IDBDatabase> | null = null;

const canUseIndexedDb = () =>
  typeof window !== "undefined" && typeof window.indexedDB !== "undefined";

const requestResult = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("IndexedDB request failed."));
  });

const transactionComplete = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error || new Error("IndexedDB transaction was aborted."));
  });

const openDatabase = () => {
  if (!canUseIndexedDb()) {
    return Promise.resolve(null);
  }
  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(TRANSACTION_STORE)) {
        const store = database.createObjectStore(TRANSACTION_STORE, {
          keyPath: "key"
        });
        store.createIndex("scope", "scope", { unique: false });
      }
      if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
        const store = database.createObjectStore(OUTBOX_STORE, {
          keyPath: "id"
        });
        store.createIndex("scope", "scope", { unique: false });
      }
      if (!database.objectStoreNames.contains(MEMBERSHIP_STORE)) {
        database.createObjectStore(MEMBERSHIP_STORE, { keyPath: "userId" });
      }
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error || new Error("Offline database could not be opened."));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("Offline database upgrade was blocked."));
    };
  });

  return databasePromise;
};

const transactionKey = (scope: string, id: string) => scope + ":" + id;

const isInRange = (date: string, range?: OfflineDateRange) =>
  !range || (date >= range.startDate && date < range.endDateExclusive);

const notifyOutboxChanged = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("ledger-outbox-change"));
  }
};

export const cacheMembership = async (membership: HouseholdMembership) => {
  const database = await openDatabase();
  if (!database) return;
  const transaction = database.transaction(MEMBERSHIP_STORE, "readwrite");
  transaction.objectStore(MEMBERSHIP_STORE).put({
    userId: membership.userId,
    membership,
    cachedAt: new Date().toISOString()
  } satisfies MembershipRecord);
  await transactionComplete(transaction);
};

export const getCachedMembership = async (userId: string) => {
  const database = await openDatabase();
  if (!database) return null;
  const transaction = database.transaction(MEMBERSHIP_STORE, "readonly");
  const record = await requestResult(
    transaction.objectStore(MEMBERSHIP_STORE).get(userId)
  );
  await transactionComplete(transaction);
  return (record as MembershipRecord | undefined)?.membership || null;
};

export const replaceCachedTransactions = async (
  scope: string,
  range: OfflineDateRange | undefined,
  transactions: Transaction[]
) => {
  const database = await openDatabase();
  if (!database) return;

  const transaction = database.transaction(
    [TRANSACTION_STORE, OUTBOX_STORE, META_STORE],
    "readwrite"
  );
  const transactionStore = transaction.objectStore(TRANSACTION_STORE);
  const cachedRecords = (await requestResult(
    transactionStore.index("scope").getAll(IDBKeyRange.only(scope))
  )) as CachedTransactionRecord[];

  for (const record of cachedRecords) {
    if (isInRange(record.date, range)) {
      transactionStore.delete(record.key);
    }
  }

  const cachedAt = new Date().toISOString();
  for (const item of transactions) {
    transactionStore.put({
      key: transactionKey(scope, item.id),
      scope,
      date: item.date,
      transaction: { ...item, syncStatus: undefined },
      cachedAt
    } satisfies CachedTransactionRecord);
  }

  const queued = (await requestResult(
    transaction
      .objectStore(OUTBOX_STORE)
      .index("scope")
      .getAll(IDBKeyRange.only(scope))
  )) as QueuedTransactionCreate[];
  for (const item of queued) {
    if (isInRange(item.transaction.date, range)) {
      transactionStore.put({
        key: transactionKey(scope, item.transaction.id),
        scope,
        date: item.transaction.date,
        transaction: { ...item.transaction, syncStatus: "pending" },
        cachedAt: item.createdAt
      } satisfies CachedTransactionRecord);
    }
  }

  transaction.objectStore(META_STORE).put({
    key: "transactionsSyncedAt:" + scope,
    value: cachedAt
  } satisfies MetaRecord);
  await transactionComplete(transaction);
};

export const getCachedTransactions = async (
  scope: string,
  range?: OfflineDateRange
) => {
  const database = await openDatabase();
  if (!database) return [];

  const transaction = database.transaction(TRANSACTION_STORE, "readonly");
  const records = (await requestResult(
    transaction
      .objectStore(TRANSACTION_STORE)
      .index("scope")
      .getAll(IDBKeyRange.only(scope))
  )) as CachedTransactionRecord[];
  await transactionComplete(transaction);

  return records
    .filter((record) => isInRange(record.date, range))
    .map((record) => record.transaction)
    .sort(
      (left, right) =>
        right.date.localeCompare(left.date) || right.id.localeCompare(left.id)
    );
};

export const getCachedTransaction = async (scope: string, id: string) => {
  const database = await openDatabase();
  if (!database) return null;

  const transaction = database.transaction(TRANSACTION_STORE, "readonly");
  const record = await requestResult(
    transaction.objectStore(TRANSACTION_STORE).get(transactionKey(scope, id))
  );
  await transactionComplete(transaction);
  return (record as CachedTransactionRecord | undefined)?.transaction || null;
};

export const cacheTransaction = async (scope: string, item: Transaction) => {
  const database = await openDatabase();
  if (!database) return;

  const transaction = database.transaction(TRANSACTION_STORE, "readwrite");
  transaction.objectStore(TRANSACTION_STORE).put({
    key: transactionKey(scope, item.id),
    scope,
    date: item.date,
    transaction: item,
    cachedAt: new Date().toISOString()
  } satisfies CachedTransactionRecord);
  await transactionComplete(transaction);
};

export const removeCachedTransaction = async (scope: string, id: string) => {
  const database = await openDatabase();
  if (!database) return;

  const transaction = database.transaction(TRANSACTION_STORE, "readwrite");
  transaction.objectStore(TRANSACTION_STORE).delete(transactionKey(scope, id));
  await transactionComplete(transaction);
};

export const queueTransactionCreate = async (
  scope: string,
  item: Transaction
) => {
  const database = await openDatabase();
  if (!database) {
    throw new Error("이 브라우저에서는 오프라인 저장소를 사용할 수 없습니다.");
  }

  const transaction = database.transaction(
    [TRANSACTION_STORE, OUTBOX_STORE],
    "readwrite"
  );
  const createdAt = new Date().toISOString();
  const pendingTransaction = { ...item, syncStatus: "pending" as const };

  transaction.objectStore(OUTBOX_STORE).put({
    id: item.id,
    scope,
    transaction: pendingTransaction,
    createdAt,
    attempts: 0
  } satisfies QueuedTransactionCreate);
  transaction.objectStore(TRANSACTION_STORE).put({
    key: transactionKey(scope, item.id),
    scope,
    date: item.date,
    transaction: pendingTransaction,
    cachedAt: createdAt
  } satisfies CachedTransactionRecord);

  await transactionComplete(transaction);
  notifyOutboxChanged();
  return pendingTransaction;
};

export const getQueuedTransactionCreates = async (scope: string) => {
  const database = await openDatabase();
  if (!database) return [];

  const transaction = database.transaction(OUTBOX_STORE, "readonly");
  const records = (await requestResult(
    transaction
      .objectStore(OUTBOX_STORE)
      .index("scope")
      .getAll(IDBKeyRange.only(scope))
  )) as QueuedTransactionCreate[];
  await transactionComplete(transaction);
  return records.sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt)
  );
};

export const incrementQueuedTransactionAttempts = async (id: string) => {
  const database = await openDatabase();
  if (!database) return;

  const transaction = database.transaction(OUTBOX_STORE, "readwrite");
  const store = transaction.objectStore(OUTBOX_STORE);
  const record = (await requestResult(store.get(id))) as
    | QueuedTransactionCreate
    | undefined;
  if (record) {
    store.put({ ...record, attempts: record.attempts + 1 });
  }
  await transactionComplete(transaction);
};

export const completeQueuedTransaction = async (
  scope: string,
  item: Transaction
) => {
  const database = await openDatabase();
  if (!database) return;

  const transaction = database.transaction(
    [TRANSACTION_STORE, OUTBOX_STORE],
    "readwrite"
  );
  transaction.objectStore(OUTBOX_STORE).delete(item.id);
  transaction.objectStore(TRANSACTION_STORE).put({
    key: transactionKey(scope, item.id),
    scope,
    date: item.date,
    transaction: { ...item, syncStatus: undefined },
    cachedAt: new Date().toISOString()
  } satisfies CachedTransactionRecord);
  await transactionComplete(transaction);
  notifyOutboxChanged();
};

export const getPendingTransactionCount = async (scope?: string | null) => {
  if (scope === null) return 0;
  const database = await openDatabase();
  if (!database) return 0;

  const transaction = database.transaction(OUTBOX_STORE, "readonly");
  const store = transaction.objectStore(OUTBOX_STORE);
  const count = scope
    ? await requestResult(store.index("scope").count(IDBKeyRange.only(scope)))
    : await requestResult(store.count());
  await transactionComplete(transaction);
  return count;
};

export const getTransactionsLastSyncedAt = async (scope: string) => {
  const database = await openDatabase();
  if (!database) return null;

  const transaction = database.transaction(META_STORE, "readonly");
  const record = await requestResult(
    transaction.objectStore(META_STORE).get("transactionsSyncedAt:" + scope)
  );
  await transactionComplete(transaction);
  return (record as MetaRecord | undefined)?.value || null;
};

export const clearOfflineScope = async (scope: string) => {
  const database = await openDatabase();
  if (!database) return;

  const transaction = database.transaction(
    [TRANSACTION_STORE, OUTBOX_STORE, MEMBERSHIP_STORE, META_STORE],
    "readwrite"
  );
  const transactionStore = transaction.objectStore(TRANSACTION_STORE);
  const cachedRecords = (await requestResult(
    transactionStore.index("scope").getAll(IDBKeyRange.only(scope))
  )) as CachedTransactionRecord[];
  cachedRecords.forEach((record) => transactionStore.delete(record.key));

  const outboxStore = transaction.objectStore(OUTBOX_STORE);
  const queuedRecords = (await requestResult(
    outboxStore.index("scope").getAll(IDBKeyRange.only(scope))
  )) as QueuedTransactionCreate[];
  queuedRecords.forEach((record) => outboxStore.delete(record.id));

  transaction.objectStore(MEMBERSHIP_STORE).delete(scope);
  transaction.objectStore(META_STORE).delete("transactionsSyncedAt:" + scope);
  await transactionComplete(transaction);
  notifyOutboxChanged();
};
