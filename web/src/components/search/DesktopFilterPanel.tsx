import { useState } from "react";
import { Cap } from "@/components/primitives";

const TAG_GROUPS: { label: string; tags: string[] }[] = [
  { label: "工作 / 讀書", tags: ["有插座", "不限時", "安靜", "Wi-Fi", "大桌面", "適合讀書"] },
  { label: "社交", tags: ["適合聊天", "可訂位", "適合多人"] },
  { label: "其他", tags: ["低消友善", "戶外座", "停車方便"] },
];

const SORT_OPTIONS = ["距離", "評分", "熱門"];

interface DesktopFilterPanelProps {
  onApply?: (tags: string[], distance: number) => void;
  onClose?: () => void;
}

/**
 * 桌面版進階篩選面板 — 嵌入在 detail column 中,取代咖啡廳詳細資訊。
 */
export function DesktopFilterPanel({ onApply, onClose }: DesktopFilterPanelProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [distance, setDistance] = useState(3);
  const [sort, setSort] = useState("距離");

  const toggle = (tag: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  };

  const reset = () => {
    setSelected(new Set());
    setDistance(3);
    setSort("距離");
  };

  const mockCount = Math.max(1, 12 - selected.size * 2);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-base-content/10 px-5 py-3">
        <h2 className="text-sm font-semibold">進階篩選</h2>
        <div className="flex gap-1">
          <button type="button" onClick={reset} className="btn btn-ghost btn-xs">
            重置
          </button>
          {onClose && (
            <button type="button" onClick={onClose} className="btn btn-ghost btn-xs">
              ✕
            </button>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {/* Distance */}
        <section className="pt-4">
          <Cap>距離</Cap>
          <input
            type="range"
            min={1}
            max={10}
            value={distance}
            onChange={(e) => setDistance(Number(e.target.value))}
            className="range range-sm mt-3"
          />
          <div className="mt-1 flex justify-between text-[10px] text-base-content/50">
            <span>1km</span>
            <span>3km</span>
            <span>5km</span>
            <span>10km</span>
          </div>
        </section>

        <div className="divider my-3" />

        {/* Tag groups */}
        {TAG_GROUPS.map((group) => (
          <section key={group.label} className="mb-4">
            <Cap>{group.label}</Cap>
            <div className="mt-2 flex flex-wrap gap-2">
              {group.tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggle(tag)}
                  className={`btn btn-xs ${selected.has(tag) ? "btn-neutral" : "btn-ghost border border-base-content/15"}`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </section>
        ))}

        <div className="divider my-3" />

        {/* Sort */}
        <section>
          <Cap>排序依據</Cap>
          <div className="mt-2 flex flex-wrap gap-2">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setSort(opt)}
                className={`btn btn-xs ${sort === opt ? "btn-neutral" : "btn-ghost border border-base-content/15"}`}
              >
                {opt}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="border-t border-base-content/10 px-5 py-3">
        <button
          type="button"
          onClick={() => onApply?.(Array.from(selected), distance)}
          className="btn btn-neutral btn-sm btn-block"
        >
          顯示 {mockCount} 間 →
        </button>
      </div>
    </div>
  );
}
