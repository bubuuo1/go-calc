import Head from "next/head";
import { useRouter } from "next/router";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseBrowserClient } from "@/services/supabase";
import type { Inputter } from "@/types/transaction";

type SetupMode = "claim" | "create" | "join";

const SETUP_OPTIONS: Array<{
  mode: SetupMode;
  title: string;
  description: string;
  icon: string;
}> = [
  {
    mode: "claim",
    title: "기존 가계부 이어받기",
    description: "기존 솔샘네 거래를 일회용 코드로 안전하게 연결합니다.",
    icon: "↗"
  },
  {
    mode: "create",
    title: "새 가계부 만들기",
    description: "비어 있는 우리만의 공유 가계부를 새로 시작합니다.",
    icon: "+"
  },
  {
    mode: "join",
    title: "배우자 가계부 참여",
    description: "배우자가 만든 초대 코드를 입력해 같은 공간에 참여합니다.",
    icon: "♡"
  }
];

const setupErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("display_name_required")) {
    return "화면에 표시할 이름을 입력해 주세요.";
  }
  if (message.includes("household_name_required")) {
    return "가계부 이름을 입력해 주세요.";
  }
  if (message.includes("code_required")) {
    return "전달받은 코드를 입력해 주세요.";
  }
  if (message.includes("membership_load_failed")) {
    return "연결은 완료됐지만 가구 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (message.includes("expired")) {
    return "초대 코드의 유효기간이 지났습니다. 새 코드를 받아 주세요.";
  }
  if (message.includes("invite") || message.includes("claim") || message.includes("code")) {
    return "코드가 올바르지 않거나 이미 사용되었습니다.";
  }
  if (message.includes("already") || message.includes("member")) {
    return "이미 다른 공유 가구에 연결된 계정입니다.";
  }
  if (message.includes("inputter") || message.includes("duplicate")) {
    return "해당 역할은 이미 사용 중입니다. 다른 역할을 선택해 주세요.";
  }

  return "공유 가구를 연결하지 못했습니다. 입력 내용을 확인하고 다시 시도해 주세요.";
};

export default function SetupPage() {
  const router = useRouter();
  const { session, user, membership, loading, refreshMembership, signOut } = useAuth();
  const [mode, setMode] = useState<SetupMode>("claim");
  const [displayName, setDisplayName] = useState("");
  const [inputter, setInputter] = useState<Inputter>("husband");
  const [householdName, setHouseholdName] = useState("우리집 가계부");
  const [claimCode, setClaimCode] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !session) {
      void router.replace("/login");
      return;
    }

    if (!loading && membership) {
      void router.replace("/");
    }
  }, [loading, membership, router, session]);

  const selectMode = (nextMode: SetupMode) => {
    setMode(nextMode);
    setErrorMessage(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    try {
      setIsSubmitting(true);
      const supabase = getSupabaseBrowserClient();
      const trimmedDisplayName = displayName.trim();
      let error: { message: string } | null = null;

      if (!trimmedDisplayName) {
        throw new Error("display_name_required");
      }

      if (mode === "claim") {
        if (!claimCode.trim()) {
          throw new Error("code_required");
        }
        ({ error } = await supabase.rpc("claim_legacy_household", {
          claim_code: claimCode.trim(),
          p_display_name: trimmedDisplayName,
          p_inputter: inputter
        }));
      } else if (mode === "create") {
        if (!householdName.trim()) {
          throw new Error("household_name_required");
        }
        ({ error } = await supabase.rpc("create_household", {
          p_name: householdName.trim(),
          p_display_name: trimmedDisplayName,
          p_inputter: inputter
        }));
      } else {
        if (!inviteCode.trim()) {
          throw new Error("code_required");
        }
        ({ error } = await supabase.rpc("accept_household_invite", {
          invite_code: inviteCode.trim(),
          p_display_name: trimmedDisplayName
        }));
      }

      if (error) {
        throw new Error(error.message);
      }

      const nextMembership = await refreshMembership();
      if (!nextMembership) {
        throw new Error("membership_load_failed");
      }

      await router.replace("/");
    } catch (error) {
      setErrorMessage(setupErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || !session || membership) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <p className="text-sm font-black text-blue-700" role="status">
          공유 가구를 확인하고 있어요...
        </p>
      </main>
    );
  }

  return (
    <>
      <Head>
        <title>공유 가구 설정 | 솔샘네 가계부</title>
        <meta name="description" content="가계부 공유 공간 연결" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:py-10">
        <div className="mx-auto w-full max-w-3xl">
          <header className="rounded-3xl bg-gradient-to-br from-blue-700 to-blue-600 p-5 text-white shadow-xl shadow-blue-200/70 sm:p-6">
            <p className="text-xs font-black tracking-[0.18em] text-blue-100">첫 설정</p>
            <h1 className="mt-2 text-2xl font-black">어떤 가계부에 연결할까요?</h1>
            <p className="mt-2 text-sm font-bold leading-6 text-blue-100">
              계정은 계속 유지되며, 연결한 가구의 거래만 두 사람이 함께 볼 수 있어요.
            </p>
            <p className="mt-4 truncate rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-blue-50">
              로그인 계정 · {user?.email || "이메일 계정"}
            </p>
          </header>

          <div
            aria-label="가계부 연결 방식"
            className="mt-4 grid gap-3 md:grid-cols-3"
            role="group"
          >
            {SETUP_OPTIONS.map((option) => {
              const active = option.mode === mode;
              return (
                <button
                  key={option.mode}
                  aria-pressed={active}
                  className={
                    active
                      ? "rounded-2xl border-2 border-blue-600 bg-blue-50 p-4 text-left shadow-sm"
                      : "rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50/40"
                  }
                  type="button"
                  onClick={() => selectMode(option.mode)}
                >
                  <span
                    aria-hidden="true"
                    className={
                      active
                        ? "grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-lg font-black text-white"
                        : "grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-lg font-black text-slate-500"
                    }
                  >
                    {option.icon}
                  </span>
                  <strong className="mt-3 block text-sm font-black text-slate-950">
                    {option.title}
                  </strong>
                  <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">
                    {option.description}
                  </span>
                </button>
              );
            })}
          </div>

          <section className="panel mt-4 p-4 sm:p-6">
            <div>
              <p className="text-xs font-black text-blue-600">선택한 방식</p>
              <h2 className="mt-1 text-xl font-black">
                {SETUP_OPTIONS.find((option) => option.mode === mode)?.title}
              </h2>
            </div>

            <form className="mt-5 grid gap-4" onSubmit={submit}>
              <label
                className="grid gap-1.5 text-xs font-black text-slate-700"
                htmlFor="setup-display-name"
              >
                화면에 표시할 이름
                <input
                  id="setup-display-name"
                  className="input"
                  maxLength={30}
                  placeholder="예: 솔샘"
                  required
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </label>

              {mode === "claim" ? (
                <label
                  className="grid gap-1.5 text-xs font-black text-slate-700"
                  htmlFor="setup-claim-code"
                >
                  기존 데이터 일회용 코드
                  <input
                    id="setup-claim-code"
                    autoCapitalize="none"
                    autoComplete="off"
                    className="input font-mono tracking-wider"
                    placeholder="전달받은 코드를 입력하세요"
                    required
                    value={claimCode}
                    onChange={(event) => setClaimCode(event.target.value)}
                  />
                </label>
              ) : null}

              {mode === "create" ? (
                <label
                  className="grid gap-1.5 text-xs font-black text-slate-700"
                  htmlFor="setup-household-name"
                >
                  가계부 이름
                  <input
                    id="setup-household-name"
                    className="input"
                    maxLength={50}
                    required
                    value={householdName}
                    onChange={(event) => setHouseholdName(event.target.value)}
                  />
                </label>
              ) : null}

              {mode === "join" ? (
                <label
                  className="grid gap-1.5 text-xs font-black text-slate-700"
                  htmlFor="setup-invite-code"
                >
                  배우자 초대 코드
                  <input
                    id="setup-invite-code"
                    autoCapitalize="none"
                    autoComplete="off"
                    className="input font-mono tracking-wider"
                    placeholder="배우자에게 받은 코드를 입력하세요"
                    required
                    value={inviteCode}
                    onChange={(event) => setInviteCode(event.target.value)}
                  />
                </label>
              ) : null}

              {mode !== "join" ? (
                <fieldset>
                  <legend className="text-xs font-black text-slate-700">
                    가계부 역할
                  </legend>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    {(["husband", "wife"] as Inputter[]).map((value) => (
                      <button
                        key={value}
                        aria-pressed={inputter === value}
                        className={
                          inputter === value
                            ? "h-11 rounded-xl border border-blue-600 bg-blue-600 text-sm font-black text-white"
                            : "h-11 rounded-xl border border-slate-300 bg-white text-sm font-black text-slate-700 transition hover:border-blue-300 hover:bg-blue-50"
                        }
                        type="button"
                        onClick={() => setInputter(value)}
                      >
                        {value === "husband" ? "남편" : "아내"}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ) : null}

              {errorMessage ? (
                <p
                  className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700"
                  role="alert"
                >
                  {errorMessage}
                </p>
              ) : null}

              <button
                className="btn-primary mt-1"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? "연결 중..." : "가계부 연결하고 시작하기"}
              </button>
            </form>
          </section>

          <button
            className="mx-auto mt-4 block min-h-11 px-4 text-sm font-black text-slate-500 underline-offset-4 hover:text-slate-800 hover:underline"
            type="button"
            onClick={() => void signOut()}
          >
            다른 계정으로 로그인
          </button>
        </div>
      </main>
    </>
  );
}
