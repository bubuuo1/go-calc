import type { Inputter } from "@/types/transaction";

export type HouseholdRole = "owner" | "member";

export type Household = {
  id: string;
  name: string;
};

export type HouseholdMembership = {
  householdId: string;
  userId: string;
  role: HouseholdRole;
  displayName: string;
  inputter: Inputter;
  household: Household;
};

export type SignUpResult = {
  requiresEmailConfirmation: boolean;
};
