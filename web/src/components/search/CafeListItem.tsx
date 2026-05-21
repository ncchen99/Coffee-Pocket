import { Link } from "react-router-dom";
import { Placeholder, TagBadge } from "@/components/primitives";
import type { CafeCard } from "@/types/cafe";
import clsx from "@/lib/clsx";
import { formatDistance } from "@/lib/format";
import { HugeiconsIcon } from "@hugeicons/react";
import { StarIcon } from "@hugeicons/core-free-icons";

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
          <span className="font-mono text-xs text-base-content/55 shrink-0 flex items-center gap-0.5">
            {sortKey === "rating"
              ? cafe.google_rating != null ? (
                  <>
                    <HugeiconsIcon icon={StarIcon} size={11} className="text-warning fill-warning" />
                    <span className="font-semibold text-warning">{cafe.google_rating.toFixed(1)}</span>
                  </>
                ) : (
                  "—"
                )
              : formatDistance(cafe.distance_km)}
          </span>
        </div>
        {cafe.top_tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {cafe.top_tags.map((t) => (
              <TagBadge key={t} variant="neutral" size="sm">
                {t}
              </TagBadge>
            ))}
          </div>
        )}
        <div className="mt-1 text-[11px] text-base-content/45">
          {cafe.open_now
            ? cafe.closes_at
              ? `營業中 · 至 ${cafe.closes_at}`
              : "營業中"
            : "今日已休"}
        </div>
      </div>
    </Link>
  );
}
