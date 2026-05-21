import { Link } from "react-router-dom";
import { Placeholder, TagBadge } from "@/components/primitives";
import type { CafeCard } from "@/types/cafe";
import clsx from "@/lib/clsx";
import { formatDistance } from "@/lib/format";

interface CafeListItemProps {
  cafe: CafeCard;
  /** 已棄用 — 列表項目不再顯示序號前綴，但保留參數以維持呼叫端 API 相容。 */
  index?: number;
  active?: boolean;
  size?: "sm" | "md" | "lg";
  /** 主排序欄位 — 影響右上角顯示距離或評分。預設 distance。 */
  sortKey?: "distance" | "rating";
  onHover?: (id: string | null) => void;
}

/** 列表項 — 桌面 (lg) / 手機 (sm/md) 共用。 */
export function CafeListItem({
  cafe,
  active,
  size = "md",
  sortKey = "distance",
  onHover,
}: CafeListItemProps) {
  const dims = {
    sm: "h-14 w-14",
    md: "h-16 w-16",
    lg: "h-24 w-24",
  }[size];

  // 再點一次已選中的項目就回首頁(關閉詳細區塊)。
  return (
    <Link
      to={active ? "/" : `/cafe/${cafe.id}`}
      onMouseEnter={() => onHover?.(cafe.id)}
      onMouseLeave={() => onHover?.(null)}
      className={clsx(
        "flex gap-3 px-4 py-3 transition-colors hover:bg-base-200",
        active && "bg-base-200",
      )}
    >
      {cafe.cover_url ? (
        <img
          src={cafe.cover_url}
          alt=""
          loading="lazy"
          className={clsx(
            dims,
            "shrink-0 object-cover bg-base-200",
          )}
          onError={(e) => {
            // 圖片載入失敗 → 換成 placeholder background。
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <Placeholder className={clsx(dims, "shrink-0")} ratio="square" label="img" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={clsx("truncate font-semibold", size === "lg" ? "text-base" : "text-sm")}>
            {cafe.name}
          </span>
          <span className="font-mono text-xs text-base-content/55 shrink-0">
            {sortKey === "rating"
              ? cafe.google_rating != null
                ? `★ ${cafe.google_rating.toFixed(1)}`
                : "—"
              : formatDistance(cafe.distance_km)}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-base-content/65 truncate">
          {cafe.top_tags.join(" · ")}
        </div>
        <div className="mt-0.5 text-[11px] text-base-content/45">
          {cafe.open_now ? `營業中 · 至 ${cafe.closes_at}` : "今日已休"}
        </div>
        {size === "lg" && (
          <div className="mt-2 flex flex-wrap gap-1">
            {cafe.top_tags.map((t) => (
              <TagBadge key={t}>{t}</TagBadge>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
