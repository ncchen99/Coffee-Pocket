import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { BookmarkAdd01Icon, Add01Icon } from "@hugeicons/core-free-icons";
import type { Pocket } from "@/types/cafe";

interface PocketPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  pockets: Pocket[];
  onPick: (pocketId: string) => void;
  onCreate: () => void;
}

/**
 * 選擇要把咖啡店加入哪個口袋的 Modal。
 * 沒有口袋時引導使用者去建立新口袋。
 */
export function PocketPickerModal({
  isOpen,
  onClose,
  pockets,
  onPick,
  onCreate,
}: PocketPickerModalProps) {
  const [picked, setPicked] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!picked) return;
    onPick(picked);
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
            <HugeiconsIcon icon={BookmarkAdd01Icon} size={20} strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-base-content leading-snug">加入口袋</h3>
            <p className="mt-2 text-xs text-base-content/65 leading-relaxed">
              選擇要把這間店加入哪個口袋
            </p>
          </div>
        </div>

        {pockets.length === 0 ? (
          <div className="mt-4 border border-dashed border-base-content/15 px-4 py-6 text-center">
            <p className="text-sm text-base-content/65">還沒有口袋名單</p>
            <button
              type="button"
              onClick={() => {
                onClose();
                onCreate();
              }}
              className="btn btn-neutral btn-sm rounded-none mt-3"
            >
              <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.5} />
              建立第一個口袋
            </button>
          </div>
        ) : (
          <ul className="mt-4 max-h-60 overflow-y-auto border border-base-content/15 divide-y divide-base-content/10">
            {pockets.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setPicked(p.id)}
                  className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-base-200/60 ${
                    picked === p.id ? "bg-base-200 font-semibold" : ""
                  }`}
                >
                  {p.emoji ? `${p.emoji} ` : ""}
                  {p.name}
                  <span className="float-right text-xs text-base-content/55">
                    {p.item_count ?? 0} 間
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex items-center justify-between gap-2">
          {pockets.length > 0 && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onCreate();
              }}
              className="btn btn-ghost btn-sm text-xs rounded-none gap-1"
            >
              <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.5} />
              新口袋
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost btn-sm text-sm rounded-none font-normal px-4"
            >
              取消
            </button>
            {pockets.length > 0 && (
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!picked}
                className="btn btn-neutral btn-sm text-sm rounded-none font-medium px-4"
              >
                加入
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
