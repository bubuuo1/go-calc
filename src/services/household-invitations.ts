import { getSupabaseBrowserClient } from "@/services/supabase";
import type {
  HouseholdEmailInvite,
  PendingHouseholdInvite
} from "@/types/household";
import type { Inputter } from "@/types/transaction";

type PendingInviteRow = {
  invite_id: string;
  invitee_email: string;
  inputter: Inputter;
  expires_at: string;
  created_at: string;
};

type InviteDetailsRow = {
  household_name: string;
  inviter_display_name: string;
  invitee_email: string;
  inputter: Inputter;
  expires_at: string;
};

const responseError = async (response: Response, fallback: string) => {
  const body = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;
  return new Error(body?.error || fallback);
};

export const sendHouseholdInviteEmail = async (
  inviteeEmail: string,
  inputter: Inputter
) => {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("로그인이 만료되었습니다. 다시 로그인해 주세요.");
  }

  const response = await fetch("/api/household/invitations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ inviteeEmail, inputter })
  });

  if (!response.ok) {
    throw await responseError(response, "초대 메일을 보내지 못했습니다.");
  }
};

export const listPendingHouseholdInvites = async () => {
  const { data, error } = await getSupabaseBrowserClient().rpc(
    "list_household_email_invites"
  );
  if (error) {
    throw error;
  }

  return ((data || []) as PendingInviteRow[]).map(
    (row): PendingHouseholdInvite => ({
      id: row.invite_id,
      inviteeEmail: row.invitee_email,
      inputter: row.inputter,
      expiresAt: row.expires_at,
      createdAt: row.created_at
    })
  );
};

export const cancelPendingHouseholdInvite = async (inviteId: string) => {
  const { data, error } = await getSupabaseBrowserClient().rpc(
    "cancel_household_email_invite",
    { p_invite_id: inviteId }
  );
  if (error) {
    throw error;
  }
  if (data !== true) {
    throw new Error("취소할 초대를 찾지 못했습니다.");
  }
};

export const getHouseholdEmailInvite = async (inviteToken: string) => {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc("get_household_email_invite", { p_invite_token: inviteToken })
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }

  const row = data as InviteDetailsRow;
  return {
    householdName: row.household_name,
    inviterDisplayName: row.inviter_display_name,
    inviteeEmail: row.invitee_email,
    inputter: row.inputter,
    expiresAt: row.expires_at
  } satisfies HouseholdEmailInvite;
};

export const acceptHouseholdEmailInvite = async (
  inviteToken: string,
  displayName: string
) => {
  const { error } = await getSupabaseBrowserClient().rpc(
    "accept_household_email_invite",
    {
      p_invite_token: inviteToken,
      p_display_name: displayName
    }
  );
  if (error) {
    throw error;
  }
};
