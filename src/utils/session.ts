import { currentMonthKey, isMonthKey } from "@/utils/month";
import type { Inputter } from "@/types/transaction";

const MONTH_KEY = "go-calc:selected-month";
const ENTERED_KEY = "go-calc:entered";
const INPUTTER_KEY = "go-calc:inputter";
const EDIT_TRANSACTION_KEY = "go-calc:edit-transaction-id";

const canUseSession = () => typeof window !== "undefined";
const isInputter = (value: unknown): value is Inputter => value === "husband" || value === "wife";

export const markAppEntered = () => {
  if (canUseSession()) {
    window.sessionStorage.setItem(ENTERED_KEY, "true");
  }
};

export const hasAppEntered = () =>
  canUseSession() && window.sessionStorage.getItem(ENTERED_KEY) === "true";

export const getStoredMonth = () => {
  if (!canUseSession()) {
    return currentMonthKey();
  }

  const storedMonth = window.sessionStorage.getItem(MONTH_KEY);
  return isMonthKey(storedMonth) ? storedMonth : currentMonthKey();
};

export const setStoredMonth = (month: string) => {
  if (canUseSession() && isMonthKey(month)) {
    window.sessionStorage.setItem(MONTH_KEY, month);
  }
};

export const getStoredInputter = () => {
  if (!canUseSession()) {
    return null;
  }

  const storedInputter = window.sessionStorage.getItem(INPUTTER_KEY);
  return isInputter(storedInputter) ? storedInputter : null;
};

export const setStoredInputter = (inputter: Inputter) => {
  if (canUseSession()) {
    window.sessionStorage.setItem(INPUTTER_KEY, inputter);
  }
};

export const getStoredEditTransactionId = () => {
  if (!canUseSession()) {
    return null;
  }

  return window.sessionStorage.getItem(EDIT_TRANSACTION_KEY);
};

export const setStoredEditTransactionId = (id: string) => {
  if (canUseSession()) {
    window.sessionStorage.setItem(EDIT_TRANSACTION_KEY, id);
  }
};

export const clearStoredEditTransactionId = () => {
  if (canUseSession()) {
    window.sessionStorage.removeItem(EDIT_TRANSACTION_KEY);
  }
};
