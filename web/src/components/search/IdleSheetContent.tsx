import { CafeListItem } from "@/components/search/CafeListItem";
import type { CafeCard } from "@/types/cafe";

interface Props {
  cafes: CafeCard[];
  isLoading: boolean;
  isError: boolean;
  /** 結果清單 ul 重新 mount 時的 callback,讓父層還原捲動位置。 */
  listRef?: (el: HTMLUListElement | null) => void;
  onScroll?: (e: React.UIEvent<HTMLUListElement>) => void;
}

/** Idle 模式的 sheet 內容 — 顯示「附近的好咖啡」推薦列表。 */
export function IdleSheetContent({ cafes, isLoading, isError, listRef, onScroll }: Props) {
  return (
    <>
      <header className="flex items-center justify-between px-5 pt-1   pb-2">
        <h2 className="text-[15px] font-semibold">附近的好咖啡</h2>
        <span className="text-xs text-base-content/55">推薦</span>
      </header>
      <div className="h-[1px] bg-base-content/10 w-full shrink-0" />
      {isError ? (
        <p className="px-5 py-6 text-center text-sm text-base-content/55">
          載入失敗，請稍後再試
        </p>
      ) : isLoading ? (
        <ul className="flex-1 divide-y divide-base-content/10 overflow-y-auto">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="px-5 py-3">
              <div className="h-14 animate-pulse rounded bg-base-200" />
            </li>
          ))}
        </ul>
      ) : cafes.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-base-content/55">
          附近找不到咖啡店
        </p>
      ) : (
        <ul
          ref={listRef}
          onScroll={onScroll}
          className="flex-1 divide-y divide-base-content/10 overflow-y-auto overscroll-none pb-[30vh]"
        >
          {cafes.map((c) => (
            <li key={c.id} data-cafe-id={c.id} data-cafe-slug={c.slug ?? undefined}>
              <CafeListItem cafe={c} sortKey="smart" />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
