import Head from "next/head";
import { FormEvent, useCallback, useEffect, useState } from "react";
import BottomNav from "@/components/BottomNav";
import ExportSettingsSection from "@/components/ExportSettingsSection";
import PwaSettingsSection from "@/components/PwaSettingsSection";
import RecurringRulesSection from "@/components/RecurringRulesSection";
import { useAuth } from "@/contexts/AuthContext";
import {
  cancelPendingHouseholdInvite,
  listPendingHouseholdInvites,
  sendHouseholdInviteEmail
} from "@/services/household-invitations";
import { getSupabaseClient } from "@/services/supabase";
import type {
  HouseholdRole,
  PendingHouseholdInvite
} from "@/types/household";
import type { Inputter } from "@/types/transaction";
import { inputterLabel } from "@/utils/ledger";

type HouseholdMemberRow = {
  user_id: string;
  role: HouseholdRole;
  display_name: string;
  inputter: Inputter;
};

const errorText = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export default function SettingsPage() {
  const { membership, user, signOut } = useAuth();
  const [members, setMembers] = useState<HouseholdMemberRow[]>([]);
  const [pendingInvites, setPendingInvites] = useState<
    PendingHouseholdInvite[]
  >([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [isLoadingInvites, setIsLoadingInvites] = useState(true);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [cancellingInviteId, setCancellingInviteId] = useState<string | null>(
    null
  );
  const [isSigningOut, setIsSigningOut] = useState(false);

  const loadMembers = useCallback(async () => {
    if (!membership) {
      return;
    }

    setIsLoadingMembers(true);
    const { data, error } = await getSupabaseClient()
      .from("household_members")
      .select("user_id,role,display_name,inputter")
      .eq("household_id", membership.householdId)
      .order("created_at", { ascending: true });

    if (error) {
      setMessage("구성원 정보를 불러오지 못했습니다.");
    } else {
      setMembers((data || []) as HouseholdMemberRow[]);
    }
    setIsLoadingMembers(false);
  }, [membership]);

  const loadInvites = useCallback(async () => {
    if (!membership || membership.role !== "owner") {
      setPendingInvites([]);
      setIsLoadingInvites(false);
      return;
    }

    setIsLoadingInvites(true);
    try {
      setPendingInvites(await listPendingHouseholdInvites());
    } catch {
      setMessage("초대 정보를 불러오지 못했습니다.");
    } finally {
      setIsLoadingInvites(false);
    }
  }, [membership]);

  useEffect(() => {
    void loadMembers();
    void loadInvites();
  }, [loadInvites, loadMembers]);

  const partnerInputter: Inputter =
    membership?.inputter === "husband" ? "wife" : "husband";
  const partnerJoined = members.some((member) => member.inputter === partnerInputter);

  if (!membership) {
    return null;
  }

  const createInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSendingInvite(true);
    setMessage(null);
    try {
      await sendHouseholdInviteEmail(inviteEmail.trim(), partnerInputter);
      setInviteEmail("");
      await loadInvites();
      setMessage(
        "초대 메일을 보냈습니다. 상대방이 로그인 후 승인하면 추가됩니다."
      );
    } catch (error) {
      setMessage(errorText(error, "초대 메일을 보내지 못했습니다."));
    } finally {
      setIsSendingInvite(false);
    }
  };

  const cancelInvite = async (inviteId: string) => {
    setCancellingInviteId(inviteId);
    setMessage(null);
    try {
      await cancelPendingHouseholdInvite(inviteId);
      await loadInvites();
      setMessage("초대를 취소했습니다.");
    } catch (error) {
      setMessage(errorText(error, "초대를 취소하지 못했습니다."));
    } finally {
      setCancellingInviteId(null);
    }
  };

  return (
    <>
      <Head>
        <title>설정 | {membership.household.name} 가계부</title>
        <meta name="description" content="공유공간, 고정비, 내보내기 설정" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="min-h-screen bg-slate-50 pb-28 text-slate-950">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5 sm:px-6">
          <header className="rounded-2xl bg-gradient-to-br from-blue-700 to-blue-600 p-5 text-white shadow-lg shadow-blue-200/60">
            <p className="text-xs font-black tracking-[0.18em] text-blue-100">SETTINGS</p>
            <h1 className="mt-2 text-2xl font-black">우리 가계부 설정</h1>
            <p className="mt-1 text-sm font-bold text-blue-100">
              가족, 고정비, 내보내기를 관리해요.
            </p>
          </header>

          <section className="panel rounded-2xl p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black tracking-[0.14em] text-blue-600">
                  로그인 · 공유공간
                </p>
                <h2 className="mt-1 text-lg font-black">{membership.household.name}</h2>
                <p className="mt-1 text-sm font-bold text-slate-500">
                  {membership.displayName} · {inputterLabel[membership.inputter]} · {user?.email}
                </p>
              </div>
              <button
                className="btn-secondary shrink-0"
                disabled={isSigningOut}
                type="button"
                onClick={() => {
                  setIsSigningOut(true);
                  void signOut().catch(() => {
                    setMessage("로그아웃하지 못했습니다. 다시 시도해 주세요.");
                    setIsSigningOut(false);
                  });
                }}
              >
                {isSigningOut ? "로그아웃 중…" : "로그아웃"}
              </button>
            </div>

            <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black">함께 쓰는 사람</h3>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    같은 거래내역을 공유합니다.
                  </p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-blue-700">
                  {isLoadingMembers ? "확인 중" : `${members.length}/2명`}
                </span>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {members.map((member) => (
                  <div key={member.user_id} className="rounded-xl border border-blue-100 bg-white px-3 py-3">
                    <p className="text-sm font-black text-slate-900">{member.display_name}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">
                      {inputterLabel[member.inputter]} · {member.role === "owner" ? "관리자" : "구성원"}
                    </p>
                  </div>
                ))}
              </div>

              {membership.role === "owner" && !partnerJoined ? (
                <div className="mt-3 rounded-xl border border-dashed border-blue-300 bg-white p-3">
                  <p className="text-sm font-black">가족 초대</p>
                  <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                    메일 링크에서 로그인하고 승인하면 추가됩니다.
                  </p>
                  <form
                    className="mt-3 flex flex-col gap-2 sm:flex-row"
                    onSubmit={createInvite}
                  >
                    <label className="sr-only" htmlFor="household-invite-email">
                      초대할 이메일
                    </label>
                    <input
                      id="household-invite-email"
                      autoCapitalize="none"
                      autoComplete="email"
                      className="input flex-1"
                      inputMode="email"
                      maxLength={320}
                      placeholder="초대할 이메일"
                      required
                      type="email"
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                    />
                    <button
                      className="btn-primary"
                      disabled={isSendingInvite}
                      type="submit"
                    >
                      {isSendingInvite ? "보내는 중..." : "초대 메일 보내기"}
                    </button>
                  </form>

                  {isLoadingInvites ? (
                    <p className="mt-3 text-xs font-bold text-slate-500">
                      초대 확인 중...
                    </p>
                  ) : null}
                  {pendingInvites.map((invite) => (
                    <div
                      key={invite.id}
                      className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-blue-50 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-900">
                          {invite.inviteeEmail}
                        </p>
                        <p className="mt-0.5 text-xs font-bold text-blue-700">
                          승인 대기 · {new Date(invite.expiresAt).toLocaleDateString("ko-KR")}까지
                        </p>
                      </div>
                      <button
                        className="shrink-0 text-xs font-black text-slate-500 underline-offset-4 hover:text-slate-800 hover:underline"
                        disabled={cancellingInviteId === invite.id}
                        type="button"
                        onClick={() => void cancelInvite(invite.id)}
                      >
                        {cancellingInviteId === invite.id ? "취소 중..." : "초대 취소"}
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {message ? (
              <p className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700" role="status">
                {message}
              </p>
            ) : null}
          </section>

          <PwaSettingsSection />
          <RecurringRulesSection currentInputter={membership.inputter} />
          <ExportSettingsSection householdId={membership.householdId} />
        </div>
        <BottomNav />
      </main>
    </>
  );
}
