import Head from "next/head";
import { useCallback, useEffect, useMemo, useState } from "react";
import BottomNav from "@/components/BottomNav";
import ExportSettingsSection from "@/components/ExportSettingsSection";
import RecurringRulesSection from "@/components/RecurringRulesSection";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseClient } from "@/services/supabase";
import type { HouseholdRole } from "@/types/household";
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
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
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

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const partnerInputter = useMemo<Inputter>(
    () => (membership?.inputter === "husband" ? "wife" : "husband"),
    [membership?.inputter]
  );
  const partnerJoined = members.some((member) => member.inputter === partnerInputter);

  if (!membership) {
    return null;
  }

  const createInvite = async () => {
    setIsCreatingInvite(true);
    setInviteCode(null);
    setMessage(null);
    try {
      const { data, error } = await getSupabaseClient().rpc(
        "create_household_invite",
        { p_inputter: partnerInputter }
      );
      if (error) {
        throw error;
      }
      if (typeof data !== "string" || !data) {
        throw new Error("초대 코드를 만들지 못했습니다.");
      }
      setInviteCode(data);
      setMessage("7일 동안 사용할 수 있는 새 초대 코드를 만들었습니다.");
    } catch (error) {
      setMessage(errorText(error, "초대 코드를 만들지 못했습니다."));
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const copyInvite = async () => {
    if (!inviteCode) {
      return;
    }
    try {
      await navigator.clipboard.writeText(inviteCode);
      setMessage("초대 코드를 복사했습니다.");
    } catch {
      setMessage("복사하지 못했습니다. 코드를 길게 눌러 복사해 주세요.");
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
              공유공간과 자동 입력, 파일 발송을 한곳에서 관리해요.
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
                <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
                  로그인은 새로고침하거나 브라우저를 다시 열어도 유지됩니다. 로그아웃하거나 저장된 사이트 데이터를 지우면 다시 로그인해야 해요.
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
                    각자 계정으로 로그인해 같은 거래내역을 봅니다.
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
                  <p className="text-sm font-black">배우자 초대</p>
                  <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                    코드를 전달하면 배우자가 회원가입 후 ‘초대 코드로 참여’를 선택할 수 있어요. 새 코드를 만들면 이전 코드는 폐기됩니다.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <button
                      className="btn-primary"
                      disabled={isCreatingInvite}
                      type="button"
                      onClick={() => void createInvite()}
                    >
                      {isCreatingInvite ? "만드는 중…" : `${inputterLabel[partnerInputter]} 초대 코드 만들기`}
                    </button>
                    {inviteCode ? (
                      <button className="btn-secondary font-mono" type="button" onClick={() => void copyInvite()}>
                        {inviteCode} · 복사
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            {message ? (
              <p className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700" role="status">
                {message}
              </p>
            ) : null}
          </section>

          <RecurringRulesSection currentInputter={membership.inputter} />
          <ExportSettingsSection householdId={membership.householdId} />
        </div>
        <BottomNav />
      </main>
    </>
  );
}
