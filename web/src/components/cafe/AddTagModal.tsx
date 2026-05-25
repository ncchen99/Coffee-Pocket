import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, AlertCircleIcon } from "@hugeicons/core-free-icons";
import { DB_TAG_LABEL } from "@/data/tagMapping";
import { useAddCafeTag } from "@/hooks/useTagVote";

const DEPRECATED_TAG_KEYS = new Set([
  "socket_available",
  "pet_friendly",
  "large_desks",
  "parking_friendly",
]);

interface AddTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  cafeId: string;
  existingTags: string[];
}

/**
 * 增加新增標籤的 Modal — 支援選擇尚未擁有的標準標籤。
 * 使用 createPortal 渲染至 document.body,確保其顯示位置與 backdrop filter 與「加入口袋」Modal 完美一致。
 */
export function AddTagModal({
  isOpen,
  onClose,
  cafeId,
  existingTags,
}: AddTagModalProps) {
  const [errorMsg, setErrorMsg] = useState("");
  const addTagMutation = useAddCafeTag();

  useEffect(() => {
    if (isOpen) {
      setErrorMsg("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 篩選出該店家目前尚未擁有的標準標籤
  const existingSet = new Set(existingTags);
  const unownedStandardTags = Object.entries(DB_TAG_LABEL).filter(
    ([key]) => !existingSet.has(key) && !DEPRECATED_TAG_KEYS.has(key)
  );

  const handleAddTag = (tagKey: string) => {
    setErrorMsg("");
    addTagMutation.mutate(
      { cafeId, tagKey },
      {
        onSuccess: () => {
          onClose();
        },
        onError: (err: any) => {
          setErrorMsg(err?.message || "新增標籤失敗，請稍後再試");
        },
      }
    );
  };

  const isLoading = addTagMutation.isPending;

  // 使用 React Portal 渲染至 root 級別 DOM 節點
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* 磨砂玻璃背景 */}
      <button
        type="button"
        className="fixed inset-0 h-full w-full bg-base-300/40 backdrop-blur-sm cursor-default focus:outline-none transition-opacity"
        onClick={onClose}
        disabled={isLoading}
        aria-label="關閉"
      />

      {/* Modal 容器：使用與 PocketPickerModal 一致的 max-w-sm 與 rounded-none */}
      <div className="relative z-10 w-full max-w-sm border border-base-content/15 bg-base-100 p-6 shadow-xl rounded-none cp-anim-slide-in flex flex-col gap-4 max-h-[85vh] overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="flex gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-base-content/10 text-base-content rounded-none">
            <HugeiconsIcon icon={Add01Icon} size={20} strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-base-content leading-snug">新增標籤</h3>
            <p className="mt-1 text-xs text-base-content/65 leading-relaxed">
              選擇要把這間店新增什麼標籤
            </p>
          </div>
        </div>

        {/* 錯誤提示 */}
        {errorMsg && (
          <div className="alert alert-error text-xs rounded-none py-2 px-3 flex gap-2 border border-error/20 bg-error/10 text-error">
            <HugeiconsIcon icon={AlertCircleIcon} size={14} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 標準標籤選擇清單 */}
        <div className="mt-2 flex flex-col gap-2">
          {unownedStandardTags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {unownedStandardTags.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleAddTag(key)}
                  disabled={isLoading}
                  className="px-3 py-2 text-xs border border-base-content/15 bg-base-200/50 hover:bg-base-content hover:text-base-100 active:scale-[0.98] transition-all rounded-none font-medium flex items-center gap-1 text-base-content/85 disabled:opacity-50 disabled:pointer-events-none"
                >
                  <HugeiconsIcon icon={Add01Icon} size={11} strokeWidth={2} />
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-base-content/40 italic py-2 text-center border border-dashed border-base-content/10 rounded-none bg-base-200/10">
              這間店家已擁有所有的標準標籤囉！
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 flex justify-end gap-2 border-t border-base-content/10 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="btn btn-ghost btn-sm text-xs rounded-none font-normal px-4"
          >
            取消
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
