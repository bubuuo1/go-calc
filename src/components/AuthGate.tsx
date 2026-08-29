import { useRouter } from "next/router";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";

const PUBLIC_PATH = "/login";
const SETUP_PATH = "/setup";

export default function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const {
    session,
    membership,
    loading,
    membershipError,
    refreshMembership,
    signOut
  } = useAuth();
  const isLoginPage = router.pathname === PUBLIC_PATH;
  const isSetupPage = router.pathname === SETUP_PATH;

  useEffect(() => {
    if (!router.isReady || loading || membershipError) {
      return;
    }

    if (!session && !isLoginPage) {
      void router.replace(PUBLIC_PATH);
      return;
    }

    if (session && !membership && !isSetupPage) {
      void router.replace(SETUP_PATH);
      return;
    }

    if (session && membership && (isLoginPage || isSetupPage)) {
      void router.replace("/");
    }
  }, [
    isLoginPage,
    isSetupPage,
    loading,
    membership,
    membershipError,
    router,
    router.isReady,
    session
  ]);

  if (loading || !router.isReady) {
    return <AuthLoadingScreen />;
  }

  if (session && membershipError) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-4 text-slate-950">
        <section className="panel w-full max-w-md p-5 text-center">
          <div
            aria-hidden="true"
            className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-2xl"
          >
            !
          </div>
          <h1 className="mt-4 text-xl font-black">공유 가구 연결을 확인할 수 없어요</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
            {membershipError}
          </p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button
              className="btn-primary"
              type="button"
              onClick={() => void refreshMembership()}
            >
              다시 시도
            </button>
            <button
              className="btn-secondary"
              type="button"
              onClick={() => void signOut()}
            >
              로그아웃
            </button>
          </div>
        </section>
      </main>
    );
  }

  const canRender =
    (!session && isLoginPage) ||
    (session && !membership && isSetupPage) ||
    (session && membership && !isLoginPage && !isSetupPage);

  return canRender ? <>{children}</> : <AuthLoadingScreen />;
}
function AuthLoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 text-slate-950">
      <div className="text-center" role="status">
        <span className="mx-auto block h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
        <p className="mt-4 text-sm font-black text-slate-600">
          가계부를 준비하고 있어요
        </p>
      </div>
    </main>
  );
}
