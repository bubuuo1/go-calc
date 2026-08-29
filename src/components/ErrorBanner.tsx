type ErrorBannerProps = {
  message: string | null;
  onDismiss: () => void;
  onRetry?: () => void;
};

export default function ErrorBanner({ message, onDismiss, onRetry }: ErrorBannerProps) {
  if (!message) {
    return null;
  }

  return (
    <div
      aria-atomic="true"
      className="fixed inset-x-4 top-4 z-[70] mx-auto flex max-w-xl items-center gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800 shadow-xl"
      role="alert"
    >
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry ? (
        <button
          className="shrink-0 rounded border border-red-300 bg-white px-2 py-1 text-xs font-black text-red-700 hover:bg-red-100"
          type="button"
          onClick={onRetry}
        >
          새로고침
        </button>
      ) : null}
      <button
        aria-label="오류 알림 닫기"
        className="shrink-0 text-lg leading-none text-red-700"
        type="button"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}
