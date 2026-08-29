import Head from "next/head";
import { useRouter } from "next/router";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

type AuthMode = "signIn" | "signUp";

const authErrorMessage = (error: unknown) => {
  const code =
    typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
    return "이메일 또는 비밀번호가 맞지 않습니다.";
  }
  if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
    return "이메일 확인을 완료한 뒤 로그인해 주세요.";
  }
  if (code === "user_already_exists" || message.includes("already registered")) {
    return "이미 가입된 이메일입니다. 로그인해 주세요.";
  }
  if (code === "weak_password" || message.includes("password")) {
    return "비밀번호는 8자 이상으로 안전하게 입력해 주세요.";
  }
  if (code.includes("rate_limit") || message.includes("rate limit")) {
    return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  }

  return "로그인 처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.";
};

export default function LoginPage() {
  const router = useRouter();
  const { session, membership, loading, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && session) {
      void router.replace(membership ? "/" : "/setup");
    }
  }, [loading, membership, router, session]);

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setErrorMessage(null);
    setInfoMessage(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    if (mode === "signUp" && password !== confirmPassword) {
      setErrorMessage("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    try {
      setIsSubmitting(true);
      if (mode === "signIn") {
        await signIn(email, password);
        return;
      }

      const result = await signUp(email, password);
      if (result.requiresEmailConfirmation) {
        setInfoMessage(
          "가입 확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 이 화면에서 로그인해 주세요."
        );
        setMode("signIn");
        setPassword("");
        setConfirmPassword("");
      }
    } catch (error) {
      setErrorMessage(authErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || session) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <p className="text-sm font-black text-blue-700" role="status">
          로그인 정보를 확인하고 있어요...
        </p>
      </main>
    );
  }

  return (
    <>
      <Head>
        <title>로그인 | 솔샘네 가계부</title>
        <meta name="description" content="솔샘네 공유 가계부 로그인" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:py-12">
        <div className="mx-auto w-full max-w-md">
          <header className="rounded-3xl bg-gradient-to-br from-blue-700 to-blue-600 p-6 text-white shadow-xl shadow-blue-200/70">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 text-2xl"
              >
                ₩
              </span>
              <div>
                <p className="text-xs font-black tracking-[0.18em] text-blue-100">
                  우리 둘의 생활 기록
                </p>
                <h1 className="mt-1 text-2xl font-black">솔샘네 가계부</h1>
              </div>
            </div>
            <p className="mt-5 text-sm font-bold leading-6 text-blue-100">
              한 번 로그인하면 이 기기에서 세션이 안전하게 유지되어, 다음에도 바로
              이어서 기록할 수 있어요.
            </p>
          </header>

          <section className="panel mt-4 overflow-hidden p-4 sm:p-5">
            <div
              aria-label="로그인 방식"
              className="grid grid-cols-2 rounded-xl bg-slate-100 p-1"
              role="group"
            >
              <ModeButton
                active={mode === "signIn"}
                onClick={() => changeMode("signIn")}
              >
                로그인
              </ModeButton>
              <ModeButton
                active={mode === "signUp"}
                onClick={() => changeMode("signUp")}
              >
                회원가입
              </ModeButton>
            </div>

            <div className="mt-5">
              <h2 className="text-xl font-black">
                {mode === "signIn" ? "다시 만나 반가워요" : "가계부를 함께 시작해요"}
              </h2>
              <p className="mt-1 text-sm font-bold text-slate-500">
                {mode === "signIn"
                  ? "가입한 이메일로 로그인해 주세요."
                  : "본인 계정을 만든 뒤 가구를 연결합니다."}
              </p>
            </div>

            <form className="mt-5 grid gap-4" onSubmit={submit}>
              <label
                className="grid gap-1.5 text-xs font-black text-slate-700"
                htmlFor="auth-email"
              >
                이메일
                <input
                  id="auth-email"
                  autoComplete="email"
                  className="input"
                  inputMode="email"
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>

              <label
                className="grid gap-1.5 text-xs font-black text-slate-700"
                htmlFor="auth-password"
              >
                비밀번호
                <input
                  id="auth-password"
                  autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                  className="input"
                  minLength={8}
                  required
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>

              {mode === "signUp" ? (
                <label
                  className="grid gap-1.5 text-xs font-black text-slate-700"
                  htmlFor="auth-password-confirm"
                >
                  비밀번호 확인
                  <input
                    id="auth-password-confirm"
                    autoComplete="new-password"
                    className="input"
                    minLength={8}
                    required
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </label>
              ) : null}

              <div aria-live="polite">
                {errorMessage ? (
                  <p
                    className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700"
                    role="alert"
                  >
                    {errorMessage}
                  </p>
                ) : null}
                {infoMessage ? (
                  <p className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold leading-6 text-blue-800">
                    {infoMessage}
                  </p>
                ) : null}
              </div>

              <button
                className="btn-primary mt-1"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting
                  ? "처리 중..."
                  : mode === "signIn"
                    ? "로그인"
                    : "계정 만들기"}
              </button>
            </form>
          </section>

          <p className="mt-4 text-center text-xs font-bold leading-5 text-slate-400">
            공용 기기에서는 사용 후 로그아웃해 주세요.
          </p>
        </div>
      </main>
    </>
  );
}

function ModeButton({
  active,
  children,
  onClick
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={
        active
          ? "h-10 rounded-lg bg-white text-sm font-black text-blue-700 shadow-sm"
          : "h-10 rounded-lg text-sm font-black text-slate-500 transition hover:text-slate-800"
      }
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
