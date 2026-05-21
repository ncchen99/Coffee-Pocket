import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";

export type ReportType = "closed" | "duplicate" | "wrong" | "other";

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: { type: ReportType; note: string }) => void;
  isSubmitting?: boolean;
}

const REPORT_TYPES: { value: ReportType; label: string; hint: string }[] = [
  { value: "closed", label: "已歇業", hint: "這間店已經不再營業" },
  { value: "wrong", label: "資料有誤", hint: "地址、電話、營業時間錯誤" },
  { value: "duplicate", label: "重複店家", hint: "資料庫中有重複收錄" },
  { value: "other", label: "其他問題", hint: "其他想反映的問題" },
];

export function ReportModal({ isOpen, onClose, onSubmit, isSubmitting }: ReportModalProps) {
  const [type, setType] = useState<ReportType>("wrong");
  const [note, setNote] = useState("");

  if (!isOpen) return null;

  const handleSubmit = () => {
    onSubmit({ type, note: note.trim() });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="fixed inset-0 h-full w-full bg-base-300/40 backdrop-blur-sm cursor-default focus:outline-none"
        onClick={onClose}
        aria-label="關閉"
      />

      <div className="relative z-10 w-full max-w-md border border-base-content/15 bg-base-100 p-6 shadow-xl rounded-none cp-anim-slide-in">
        <div className="flex gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-warning/10 text-warning rounded-none">
            <HugeiconsIcon icon={AlertCircleIcon} size={20} strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-base-content leading-snug">回報問題</h3>
            <p className="mt-2 text-xs text-base-content/65 leading-relaxed">
              協助我們把資料維持得更準確，感謝你的回饋。
            </p>
          </div>
        </div>

        <fieldset className="mt-4 space-y-1">
          {REPORT_TYPES.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 border px-3 py-2 cursor-pointer transition-colors ${
                type === opt.value
                  ? "border-base-content/40 bg-base-200"
                  : "border-base-content/15 hover:bg-base-200/50"
              }`}
            >
              <input
                type="radio"
                name="report-type"
                value={opt.value}
                checked={type === opt.value}
                onChange={() => setType(opt.value)}
                className="radio radio-sm mt-0.5"
              />
              <span className="flex flex-col">
                <span className="text-sm font-medium">{opt.label}</span>
                <span className="text-xs text-base-content/55">{opt.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="補充說明 (選填)"
          rows={3}
          className="mt-3 w-full border border-base-content/15 bg-base-100 px-3 py-2 text-sm focus:outline-none focus:border-base-content/40 rounded-none resize-none"
        />

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm text-sm rounded-none font-normal px-4"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="btn btn-warning btn-sm text-sm rounded-none font-medium px-4"
          >
            {isSubmitting ? "送出中…" : "送出回報"}
          </button>
        </div>
      </div>
    </div>
  );
}
