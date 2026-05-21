import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmButtonClass?: string;
}

/**
 * 客製化確認 Modal — 遵循系統直角設計語意 (rounded-none)。
 */
export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "確認",
  cancelText = "取消",
  confirmButtonClass = "btn-error"
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <button
        type="button"
        className="fixed inset-0 h-full w-full bg-base-300/40 backdrop-blur-sm transition-opacity cursor-default focus:outline-none"
        onClick={onClose}
        aria-label="關閉"
      />

      {/* Modal Box */}
      <div className="relative z-10 w-full max-w-sm border border-base-content/15 bg-base-100 p-6 shadow-xl rounded-none cp-anim-slide-in">
        <div className="flex gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-error/10 text-error rounded-none">
            <HugeiconsIcon icon={AlertCircleIcon} size={20} strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-base-content leading-snug">{title}</h3>
            <p className="mt-2 text-xs text-base-content/65 leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm text-sm rounded-none font-normal px-4"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`btn btn-sm text-sm rounded-none font-medium px-4 ${confirmButtonClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
