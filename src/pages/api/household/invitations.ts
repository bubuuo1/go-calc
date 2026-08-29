import type { NextApiRequest, NextApiResponse } from "next";
import {
  authenticateExportRequest,
  ExportRequestError
} from "@/server/export-data";
import {
  ExportEmailConfigurationError,
  ExportEmailDeliveryError,
  sendHouseholdInviteEmail
} from "@/server/export-email";
import type { Inputter } from "@/types/transaction";

export const config = { maxDuration: 60 };

type CreatedInviteRow = {
  invite_id: string;
  invite_token: string;
  household_name: string;
  inviter_display_name: string;
  invitee_email: string;
  expires_at: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inviteRequest = (request: NextApiRequest) => {
  const inviteeEmail =
    typeof request.body?.inviteeEmail === "string"
      ? request.body.inviteeEmail.trim().toLowerCase()
      : "";
  const inputter = request.body?.inputter as Inputter | undefined;

  if (
    inviteeEmail.length < 3 ||
    inviteeEmail.length > 320 ||
    !emailPattern.test(inviteeEmail)
  ) {
    throw new ExportRequestError(
      400,
      "초대할 이메일을 확인해 주세요.",
      "invalid_invitee_email"
    );
  }
  if (inputter !== "husband" && inputter !== "wife") {
    throw new ExportRequestError(
      400,
      "초대할 역할을 확인해 주세요.",
      "invalid_inputter"
    );
  }

  return { inviteeEmail, inputter };
};

const invitationUrl = (token: string) => {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://go-calc-blond.vercel.app";
  const url = new URL("/invite", baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
};

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse
) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "POST 요청만 지원합니다." });
  }

  let inviteId: string | null = null;
  let authorizedSupabase:
    | Awaited<ReturnType<typeof authenticateExportRequest>>["supabase"]
    | null = null;

  try {
    const { supabase, householdId } = await authenticateExportRequest(request);
    authorizedSupabase = supabase;
    const { inviteeEmail, inputter } = inviteRequest(request);
    const { data, error } = await supabase.rpc(
      "create_household_email_invite",
      {
        p_invitee_email: inviteeEmail,
        p_inputter: inputter
      }
    );

    if (error) {
      throw new ExportRequestError(
        409,
        "초대를 만들지 못했습니다. 구성원 상태와 이메일을 확인해 주세요.",
        "invite_create_failed"
      );
    }

    const invite = ((data || []) as CreatedInviteRow[])[0];
    if (!invite?.invite_id || !invite.invite_token) {
      throw new ExportRequestError(
        500,
        "초대 정보를 만들지 못했습니다.",
        "invite_missing"
      );
    }
    inviteId = invite.invite_id;

    await sendHouseholdInviteEmail({
      householdId,
      inviteId,
      householdName: invite.household_name,
      inviterDisplayName: invite.inviter_display_name,
      recipientEmail: invite.invitee_email,
      inviteUrl: invitationUrl(invite.invite_token)
    });

    return response.status(201).json({
      ok: true,
      invite: {
        id: invite.invite_id,
        email: invite.invitee_email,
        inputter,
        expiresAt: invite.expires_at
      }
    });
  } catch (error) {
    if (
      inviteId &&
      authorizedSupabase &&
      (error instanceof ExportEmailConfigurationError ||
        error instanceof ExportEmailDeliveryError)
    ) {
      const { error: cancelError } = await authorizedSupabase.rpc(
        "cancel_household_email_invite",
        { p_invite_id: inviteId }
      );
      if (cancelError) {
        console.warn("전송 실패 초대를 정리하지 못했습니다.", {
          inviteId,
          message: cancelError.message
        });
      }
    }

    if (error instanceof ExportRequestError) {
      return response
        .status(error.statusCode)
        .json({ error: error.message, code: error.code });
    }
    if (error instanceof ExportEmailConfigurationError) {
      console.error("초대 메일 환경 설정이 누락되었습니다.", {
        message: error.message,
        providerCode: error.providerCode,
        providerStatus: error.providerStatus
      });
      return response.status(503).json({
        error: "메일 전송 설정이 아직 완료되지 않았습니다.",
        code: "email_not_configured"
      });
    }
    if (error instanceof ExportEmailDeliveryError) {
      console.error("가족 초대 메일 전송에 실패했습니다.", {
        message: error.message,
        providerCode: error.providerCode,
        providerStatus: error.providerStatus
      });
      return response.status(502).json({
        error: "초대 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.",
        code: "email_delivery_failed"
      });
    }

    console.error("가족 초대 요청을 처리하지 못했습니다.", error);
    return response.status(500).json({
      error: "초대 요청을 처리하지 못했습니다."
    });
  }
}
