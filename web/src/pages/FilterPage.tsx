import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { Cap } from "@/components/primitives";
import { FILTER_TAG_GROUPS, SORT_OPTIONS } from "@/data/filterTags";

/**
 * 進階篩選頁 — 手機全螢幕,多標籤交叉篩選,底部即時筆數。
 */
export default function FilterPage() {
  const navigate = useNavigate();
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

  // Mock count based on selections
  const mockCount = Math.max(1, 12 - selected.size * 2);

  const apply = () => {
    const params = new URLSearchParams();
    selected.forEach((t) => params.append("tag", t));
    params.set("d", String(distance));
    navigate(`/map?${params.toString()}`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-base-100">
      {/* Top bar */}
      <header className="navbar sticky top-0 z-30 min-h-12 border-b border-base-content/10 bg-base-100/95 px-2 backdrop-blur">
        <div className="navbar-start">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn btn-ghost btn-sm btn-square"
            aria-label="關閉"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.5} />
          </button>
        </div>
        <div className="navbar-center">
          <h1 className="text-sm font-semibold">篩選</h1>
        </div>
        <div className="navbar-end">
          <button type="button" onClick={reset} className="btn btn-ghost btn-sm text-xs">
            重置
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-5 pb-24">
        {/* Distance */}
        <section className="pt-5">
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

        <div className="divider" />

        {/* Tag groups */}
        {FILTER_TAG_GROUPS.map((group) => (
          <section key={group.label} className="mb-4">
            <Cap>{group.label}</Cap>
            <div className="mt-2 flex flex-wrap gap-2">
              {group.tags.map((tag) => (
                <button
                  key={tag.key}
                  type="button"
                  onClick={() => toggle(tag.key)}
                  className={`btn btn-sm ${selected.has(tag.key) ? "btn-neutral" : "btn-ghost border border-base-content/15"}`}
                >
                  {tag.label}
                </button>
              ))}
            </div>
          </section>
        ))}

        <div className="divider" />

        {/* Sort */}
        <section>
          <Cap>排序依據</Cap>
          <div className="mt-2 flex flex-wrap gap-2">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setSort(opt)}
                className={`btn btn-sm ${sort === opt ? "btn-neutral" : "btn-ghost border border-base-content/15"}`}
              >
                {opt}
              </button>
            ))}
          </div>
        </section>
      </main>

      {/* Sticky footer */}
      <div className="sticky bottom-0 z-20 grid grid-cols-2 gap-2 border-t border-base-content/10 bg-base-100/95 px-5 py-3 backdrop-blur">
        <button type="button" onClick={reset} className="btn btn-ghost">
          清除全部
        </button>
        <button type="button" onClick={apply} className="btn btn-neutral">
          顯示 {mockCount} 間 →
        </button>
      </div>
    </div>
  );
}
