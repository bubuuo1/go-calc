import Head from "next/head";
import { useRouter } from "next/router";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  acceptHouseholdEmailInvite,
  getHouseholdEmailInvite
} from "@/services/household-invitations";
import type { HouseholdEmailInvite } from "@/types/household";
import { inputterLabel } from "@/utils/ledger";

const inviteErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("display name")) {
    return "표시할 이름을 확인해 주세요.";
  }
  if (message.includes("already") || message.includes("member")) {
    return "이미 다른 가족 공유공간에 연결된 계정입니다.";
  }
  if (message.includes("expired") || message.includes("invalid")) {
    return "초대가 만료되었거나 이 계정에 보낸 초대가 아닙니다.";
  }
  return "초대를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
};

export default function InvitePage() {
  const router = useRouter();
  const {
    session,
    user,
    membership,
    loading,
    refreshMembership,
    signOut
  } = useAuth();
  const [invite, setInvite] = useState<HouseholdEmailInvite | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [isLoadingInvite, setIsLoadingInvite] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const token = typeof router.query.token === "string" ? router.query.token : "";
  const nextPath = token
    ? `/invite?token=${encodeURIComponent(token)}`
    : "/invite";

  useEffect(() => {
    if (!user || displayName) {
      return;
    }
    const metadataName =
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name.trim()
        : "";
    const emailName = user.email?.split("@")[0] || "";
    setDisplayName((metadataName || emailName).slice(0, 40));
  }, [displayName, user]);

  useEffect(() => {
    if (!router.isReady || !session || membership || !token) {
      return;
    }

    let active = true;
    setIsLoadingInvite(true);
    setErrorMessage(null);
    void getHouseholdEmailInvite(token)
      .then((result) => {
        if (!active) {
          return;
        }
        setInvite(result);
        if (!result) {
          setErrorMessage(
            "초대가 만료되었거나 이 계정에 보낸 초대가 아닙니다."
          );
        }
      })
      .catch((error) => {
        if (active) {
          setErrorMessage(inviteErrorMessage(error));
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingInvite(false);
        }
      });

    return () => {
      active = false;
    };
  }, [membership, router.isReady, session, token]);

  const acceptInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !displayName.trim()) {
      setErrorMessage("표시할 이름을 입력해 주세요.");
      return;
    }

    setIsAccepting(true);
    setErrorMessage(null);
    try {
      await acceptHouseholdEmailInvite(token, displayName.trim());
      const nextMembership = await refreshMembership();
      if (!nextMembership) {
        throw new Error("membership_load_failed");
      }
      await router.replace("/");
    } catch (error) {
      setErrorMessage(inviteErrorMessage(error));
    } finally {
      setIsAccepting(false);
    }
  };

  const switchAccount = async () => {
    await signOut();
    await router.push(`/login?next=${encodeURIComponent(nextPath)}`);
  };

  return (
    <>
      <Head>
        <title>가족 초대 | 솔샘네 가계부</title>
        <meta name="description" content="가족 가계부 초대 승인" />
        <meta name="robots" content="noindex,nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-8 text-slate-950">
        <section className="panel w-full max-w-md p-5 sm:p-6">
          <div
            aria-hidden="true"
            className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-2xl text-white"
          >
            ♡
          </div>
          <p className="mt-5 text-xs font-black tracking-[0.14em] text-blue-600">
            가족 초대
          </p>
          <h1 className="mt-1 text-2xl font-black">
            함께 가계부를 시작해요
          </h1>

          {!token && router.isReady ? (
            <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
              초대 링크가 올바르지 않습니다.
            </p>
          ) : null}

          {!loading && !session && token ? (
            <>
              <p className="mt-3 text-sm font-bold leading-6 text-slate-500">
                초대받은 이메일 계정으로 로그인해 주세요.
              </p>
              <button
                className="btn-primary mt-5 w-full"
                type="button"
                onClick={() =>
                  void router.push(
                    `/login?next=${encodeURIComponent(nextPath)}`
                  )
                }
              >
                로그인하고 초대 확인
              </button>
            </>
          ) : null}

          {!loading && session && membership ? (
            <>
              <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold leading-6 text-amber-800">
                이미 {membership.household.name}에 연결된 계정입니다.
              </p>
              <button
                className="btn-secondary mt-4 w-full"
                type="button"
                onClick={() => void switchAccount()}
              >
                다른 계정으로 로그인
              </button>
            </>
          ) : null}

          {!loading && session && !membership ? (
            <>
              {isLoadingInvite ? (
                <p className="mt-5 text-sm font-bold text-slate-500" role="status">
                  초대 확인 중...
                </p>
              ) : null}

              {invite ? (
                <>
                  <div className="mt-4 rounded-2xl bg-blue-50 p-4">
                    <p className="text-lg font-black text-slate-950">
                      {invite.householdName}
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-600">
                      {invite.inviterDisplayName}님의 초대 · {inputterLabel[invite.inputter]}
                    </p>
                    <p className="mt-2 truncate text-xs font-bold text-blue-700">
                      {invite.inviteeEmail}
                    </p>
                  </div>

                  <form className="mt-4 grid gap-3" onSubmit={acceptInvite}>
                    <label
                      className="grid gap-1.5 text-xs font-black text-slate-700"
                      htmlFor="invite-display-name"
                    >
                      표시할 이름
                      <input
                        id="invite-display-name"
                        className="input"
                        maxLength={40}
                        required
                        value={displayName}
                        onChange={(event) =>
                          setDisplayName(event.target.value)
                        }
                      />
                    </label>
                    <button
                      className="btn-primary"
                      disabled={isAccepting}
                      type="submit"
                    >
                      {isAccepting ? "추가 중..." : "가족으로 참여"}
                    </button>
                  </form>
                </>
              ) : null}

              {errorMessage ? (
                <p
                  className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold leading-6 text-red-700"
                  role="alert"
                >
                  {errorMessage}
                </p>
              ) : null}

              <p className="mt-4 truncate text-center text-xs font-bold text-slate-500">
                로그인 계정 · {user?.email}
              </p>
              <button
                className="mx-auto mt-1 block min-h-11 px-4 text-sm font-black text-slate-500 underline-offset-4 hover:text-slate-800 hover:underline"
                type="button"
                onClick={() => void switchAccount()}
              >
                다른 계정으로 로그인
              </button>
            </>
          ) : null}
        </section>
      </main>
    </>
  );
}
