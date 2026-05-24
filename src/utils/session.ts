import { currentMonthKey, isMonthKey } from "@/utils/month";

const MONTH_KEY = "go-calc:selected-month";
const ENTERED_KEY = "go-calc:entered";

const canUseSession = () => typeof window !== "undefined";

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
