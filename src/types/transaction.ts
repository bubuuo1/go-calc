export type TransactionType = "income" | "expense";
export type PaymentMethod = "cash" | "card";

export type Transaction = {
  id: string;
  type: TransactionType;
  paymentMethod: PaymentMethod;
  category: string;
  amount: number;
  memo: string;
  date: string;
};

export type TransactionInput = Omit<Transaction, "id">;
