export type FeedbackToastProps = {
  message: string | null;
  onDismiss: () => void;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "success" | "info";
};

const TONE_CLASS_NAMES = {
  success: "border-blue-700 bg-blue-700 text-white shadow-blue-950/20",
  info: "border-blue-200 bg-blue-50 text-blue-950 shadow-blue-950/10"
} as const;

export default function FeedbackToast({
  message,
  onDismiss,
  actionLabel,
  onAction,
  tone = "success"
}: FeedbackToastProps) {
  if (!message) {
    return null;
  }

  const isSuccess = tone === "success";
  const actionClassName = isSuccess
    ? "border-white/30 bg-white/10 text-white hover:bg-white/20"
    : "border-blue-200 bg-white text-blue-700 hover:bg-blue-100";

  return (
    <div
      aria-atomic="true"
      className={`fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-md items-center gap-2 rounded-xl border px-3 py-2 shadow-xl ${TONE_CLASS_NAMES[tone]}`}
      role="status"
    >
      <span className="min-w-0 flex-1 py-1 text-sm font-bold leading-5">{message}</span>
      {actionLabel && onAction ? (
        <button
          className={`min-h-11 shrink-0 rounded-lg border px-3 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-700 ${actionClassName}`}
          type="button"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      ) : null}
      <button
        aria-label="알림 닫기"
        className={`flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-xl leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 ${
          isSuccess
            ? "text-white/90 hover:bg-white/15 focus-visible:ring-white"
            : "text-blue-700 hover:bg-blue-100 focus-visible:ring-blue-600"
        }`}
        type="button"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}
