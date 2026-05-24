export type TransactionType = "income" | "expense";
export type PaymentMethod = "cash" | "card";
export type Inputter = "husband" | "wife";

export type Transaction = {
  id: string;
  type: TransactionType;
  paymentMethod: PaymentMethod;
  inputter: Inputter;
  category: string;
  amount: number;
  memo: string;
  date: string;
};

export type TransactionInput = Omit<Transaction, "id">;
