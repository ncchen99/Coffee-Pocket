import { useEffect } from "react";

interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface MobileChoiceSheetProps<T extends string> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  value: T;
  options: ChoiceOption<T>[];
  onChange: (v: T) => void;
}

/**
 * 手機端的下拉式選擇器 — 採用 Modal 樣式（背景模糊 + 居中）。
 * 內容區無內距，三個 Row 垂直連接，外觀像一張連續清單。
 * Esc / 點背景 → 關閉。
 */
export function MobileChoiceSheet<T extends string>({
  isOpen,
  onClose,
  title,
  value,
  options,
  onChange,
}: MobileChoiceSheetProps<T>) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="fixed inset-0 h-full w-full bg-base-300/40 backdrop-blur-sm cursor-default focus:outline-none"
        onClick={onClose}
        aria-label="關閉"
      />

      <div className="relative z-10 w-full max-w-sm border border-base-content/15 bg-base-100 shadow-xl rounded-none cp-anim-slide-in">
        <h3 className="px-4 py-3 text-sm font-semibold text-base-content border-b border-base-content/10">
          {title}
        </h3>
        <ul role="listbox" aria-label={title}>
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            return (
              <li
                key={opt.value}
                className={idx > 0 ? "border-t border-base-content/10" : ""}
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(opt.value);
                    onClose();
                  }}
                  className={`w-full px-4 py-3.5 text-left transition-colors hover:bg-base-200 ${
                    isSelected ? "bg-base-200" : ""
                  }`}
                >
                  <div
                    className={`text-sm ${
                      isSelected ? "font-semibold" : "font-normal"
                    }`}
                  >
                    {opt.label}
                  </div>
                  {opt.description && (
                    <div className="mt-0.5 text-[11px] text-base-content/55 leading-snug">
                      {opt.description}
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
