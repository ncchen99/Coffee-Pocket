import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { BookmarkAdd01Icon } from "@hugeicons/core-free-icons";

interface InputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
  title: string;
  description?: string;
  placeholder?: string;
  initialValue?: string;
  submitText?: string;
  cancelText?: string;
  icon?: typeof BookmarkAdd01Icon;
}

/**
 * 客製化輸入 Modal — 用於取代 window.prompt。
 * 風格延續 ConfirmModal 的直角設計語意 (rounded-none)。
 */
export function InputModal({
  isOpen,
  onClose,
  onSubmit,
  title,
  description,
  placeholder = "",
  initialValue = "",
  submitText = "建立",
  cancelText = "取消",
  icon = BookmarkAdd01Icon,
}: InputModalProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
      // 等下一輪 paint 後 focus,避免 transition 影響
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const trimmed = value.trim();
  const handleSubmit = () => {
    if (!trimmed) return;
    onSubmit(trimmed);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="fixed inset-0 h-full w-full bg-base-300/40 backdrop-blur-sm cursor-default focus:outline-none"
        onClick={onClose}
        aria-label="關閉"
      />

      <div className="relative z-10 w-full max-w-sm border border-base-content/15 bg-base-100 p-6 shadow-xl rounded-none cp-anim-slide-in">
        <div className="flex gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-base-content/10 text-base-content rounded-none">
            <HugeiconsIcon icon={icon} size={20} strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-base-content leading-snug">{title}</h3>
            {description && (
              <p className="mt-2 text-xs text-base-content/65 leading-relaxed">{description}</p>
            )}
          </div>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            else if (e.key === "Escape") onClose();
          }}
          placeholder={placeholder}
          className="mt-4 w-full border border-base-content/15 bg-base-100 px-3 py-2 text-sm focus:outline-none focus:border-base-content/40 rounded-none"
        />

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
            onClick={handleSubmit}
            disabled={!trimmed}
            className="btn btn-neutral btn-sm text-sm rounded-none font-medium px-4"
          >
            {submitText}
          </button>
        </div>
      </div>
    </div>
  );
}
