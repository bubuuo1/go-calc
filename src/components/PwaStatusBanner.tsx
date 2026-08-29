import { usePwa } from "@/contexts/PwaContext";

export default function PwaStatusBanner() {
  const {
    applyUpdate,
    isOnline,
    isSyncing,
    pendingCount,
    syncNow,
    updateAvailable
  } = usePwa();

  if (isOnline && pendingCount === 0 && !updateAvailable) {
    return null;
  }

  const message = updateAvailable
    ? "새 버전을 사용할 수 있어요."
    : !isOnline
      ? pendingCount > 0
        ? "오프라인 · 저장 대기 " + pendingCount + "건"
        : "오프라인 · 최근 저장 내용을 보여드려요."
      : isSyncing
        ? "저장 대기 거래를 동기화하고 있어요."
        : "저장 대기 " + pendingCount + "건";

  return (
    <aside
      className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[70] mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-white/95 px-4 py-3 text-sm font-black text-slate-800 shadow-xl shadow-blue-950/10 backdrop-blur"
      role="status"
    >
      <span>{message}</span>
      {updateAvailable ? (
        <button
          className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white"
          type="button"
          onClick={applyUpdate}
        >
          업데이트
        </button>
      ) : isOnline && pendingCount > 0 ? (
        <button
          className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white disabled:opacity-60"
          disabled={isSyncing}
          type="button"
          onClick={() => void syncNow()}
        >
          {isSyncing ? "동기화 중" : "지금 동기화"}
        </button>
      ) : null}
    </aside>
  );
}
