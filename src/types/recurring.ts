import type {
  Inputter,
  PaymentMethod,
  TransactionType
} from "@/types/transaction";

export type RecurringRule = {
  id: string;
  householdId: string;
  type: TransactionType;
  paymentMethod: PaymentMethod;
  inputter: Inputter;
  category: string;
  amount: number;
  memo: string;
  dayOfMonth: number;
  startDate: string;
  endDate: string | null;
  nextDueDate: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type RecurringRuleInput = Pick<
  RecurringRule,
  | "type"
  | "paymentMethod"
  | "inputter"
  | "category"
  | "amount"
  | "memo"
  | "dayOfMonth"
  | "startDate"
  | "endDate"
  | "active"
>;

export type RecurringRuleUpdate = Partial<RecurringRuleInput>;
