import { useCallback, useEffect, useState } from "react";
import { usePwa } from "@/contexts/PwaContext";
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushNotificationState,
  sendTestPushNotification
} from "@/services/push";

type PushState = {
  supported: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
};

const defaultPushState: PushState = {
  supported: false,
  permission: "default",
  subscribed: false
};

const errorText = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export default function PwaSettingsSection() {
  const {
    canInstall,
    installApp,
    isInstalled,
    isOnline,
    isSyncing,
    lastSyncedAt,
    pendingCount,
    syncNow,
    updateAvailable,
    applyUpdate
  } = usePwa();
  const [pushState, setPushState] = useState<PushState>(defaultPushState);
  const [isLoadingPush, setIsLoadingPush] = useState(true);
  const [pushAction, setPushAction] = useState<
    "enable" | "disable" | "test" | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);

  const refreshPushState = useCallback(async () => {
    setIsLoadingPush(true);
    try {
      setPushState(await getPushNotificationState());
    } finally {
      setIsLoadingPush(false);
    }
  }, []);

  useEffect(() => {
    void refreshPushState();
  }, [refreshPushState]);

  const enablePush = async () => {
    setPushAction("enable");
    setMessage(null);
    try {
      await enablePushNotifications();
      await refreshPushState();
      setMessage("이 기기의 가계부 알림을 켰습니다.");
    } catch (error) {
      setMessage(errorText(error, "알림을 켜지 못했습니다."));
    } finally {
      setPushAction(null);
    }
  };

  const disablePush = async () => {
    setPushAction("disable");
    setMessage(null);
    try {
      await disablePushNotifications();
      await refreshPushState();
      setMessage("이 기기의 가계부 알림을 껐습니다.");
    } catch (error) {
      setMessage(errorText(error, "알림을 끄지 못했습니다."));
    } finally {
      setPushAction(null);
    }
  };

  const sendTest = async () => {
    setPushAction("test");
    setMessage(null);
    try {
      await sendTestPushNotification();
      setMessage("테스트 알림을 보냈습니다.");
    } catch (error) {
      setMessage(errorText(error, "테스트 알림을 보내지 못했습니다."));
    } finally {
      setPushAction(null);
    }
  };

  const install = async () => {
    setMessage(null);
    const accepted = await installApp();
    setMessage(
      accepted
        ? "홈 화면에 가계부를 설치했습니다."
        : "설치가 취소되었습니다."
    );
  };

  const syncedLabel = lastSyncedAt
    ? new Intl.DateTimeFormat("ko-KR", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }).format(new Date(lastSyncedAt))
    : "아직 없음";

  return (
    <section className="panel rounded-2xl p-4 sm:p-5">
      <div>
        <p className="text-xs font-black tracking-[0.14em] text-blue-600">
          홈 화면 앱 · 오프라인
        </p>
        <h2 className="mt-1 text-lg font-black">가계부 앱 설정</h2>
        <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
          홈 화면에서 바로 실행하고, 연결이 끊겨도 최근 내역을 확인하거나 새 거래를 저장할 수 있어요.
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-black">홈 화면 설치</h3>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-blue-700">
              {isInstalled ? "설치됨" : "브라우저로 사용 중"}
            </span>
          </div>
          <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
            앱 아이콘, 독립 화면, 입력·달력·통계 바로가기를 사용할 수 있습니다.
          </p>
          {!isInstalled && canInstall ? (
            <button
              className="btn-primary mt-3 w-full"
              type="button"
              onClick={() => void install()}
            >
              홈 화면에 설치
            </button>
          ) : !isInstalled ? (
            <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-bold leading-5 text-slate-600">
              iPhone·iPad는 브라우저 공유 메뉴에서 ‘홈 화면에 추가’를 선택해 주세요.
            </p>
          ) : null}
          {updateAvailable ? (
            <button
              className="btn-secondary mt-3 w-full"
              type="button"
              onClick={applyUpdate}
            >
              새 버전으로 업데이트
            </button>
          ) : null}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-black">오프라인 동기화</h3>
            <span
              className={
                "rounded-full px-2.5 py-1 text-xs font-black " +
                (isOnline
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700")
              }
            >
              {isOnline ? "온라인" : "오프라인"}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold">
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-slate-500">저장 대기</dt>
              <dd className="mt-1 text-base font-black text-slate-950">
                {pendingCount}건
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-slate-500">최근 동기화</dt>
              <dd className="mt-1 text-sm font-black text-slate-950">
                {syncedLabel}
              </dd>
            </div>
          </dl>
          <button
            className="btn-secondary mt-3 w-full"
            disabled={!isOnline || isSyncing}
            type="button"
            onClick={() => void syncNow()}
          >
            {isSyncing ? "동기화 중…" : "지금 동기화"}
          </button>
          <p className="mt-2 text-[11px] font-bold leading-5 text-slate-500">
            오프라인에서는 신규 거래 입력만 저장됩니다. 수정·삭제는 연결 후 이용해 주세요.
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-sm font-black">기기 알림</h3>
            <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
              고정비 자동 입력과 월간 파일 발송 결과를 잠금 화면에서 확인합니다. 알림 내용에는 금액을 표시하지 않아요.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-black text-indigo-700">
            {isLoadingPush
              ? "확인 중"
              : pushState.subscribed
                ? "알림 켜짐"
                : pushState.permission === "denied"
                  ? "권한 차단됨"
                  : "알림 꺼짐"}
          </span>
        </div>

        {!isLoadingPush && !pushState.supported ? (
          <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-bold leading-5 text-slate-600">
            현재 브라우저에서는 알림을 사용할 수 없습니다. iPhone은 홈 화면에 설치한 뒤 다시 확인해 주세요.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            {pushState.subscribed ? (
              <>
                <button
                  className="btn-secondary"
                  disabled={pushAction !== null}
                  type="button"
                  onClick={() => void sendTest()}
                >
                  {pushAction === "test" ? "보내는 중…" : "테스트 알림"}
                </button>
                <button
                  className="btn-secondary"
                  disabled={pushAction !== null}
                  type="button"
                  onClick={() => void disablePush()}
                >
                  {pushAction === "disable" ? "끄는 중…" : "알림 끄기"}
                </button>
              </>
            ) : (
              <button
                className="btn-primary"
                disabled={pushAction !== null || pushState.permission === "denied"}
                type="button"
                onClick={() => void enablePush()}
              >
                {pushAction === "enable" ? "연결 중…" : "이 기기에서 알림 켜기"}
              </button>
            )}
          </div>
        )}
      </div>

      {message ? (
        <p
          className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700"
          role="status"
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
