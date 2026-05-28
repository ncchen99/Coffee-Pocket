import { useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useIsDesktop } from "@/components/layout/Responsive";
import { Placeholder, TagBadge } from "@/components/primitives";
import type { CafeCard } from "@/types/cafe";
import clsx from "@/lib/clsx";
import { formatDistance, isCafeOpenAt } from "@/lib/format";
import { HugeiconsIcon } from "@hugeicons/react";
import { StarIcon } from "@hugeicons/core-free-icons";

interface CafeListItemProps {
  cafe: CafeCard;
  /** 已棄用 — 列表項目不再顯示序號前綴，但保留參數以維持呼叫端 API 相容。 */
  index?: number;
  active?: boolean;
  size?: "sm" | "md" | "lg";
  /** 主排序欄位 — 影響右上角顯示距離或評分。預設 smart（顯示距離）。 */
  sortKey?: "smart" | "distance" | "rating";
  onHover?: (id: string | null) => void;
  onClick?: () => void;
}

/** 列表項 — 桌面 (lg) / 手機 (sm/md) 共用。 */
export function CafeListItem({
  cafe,
  active,
  size = "md",
  sortKey = "smart",
  onHover,
  onClick,
}: CafeListItemProps) {
  const isDesktop = useIsDesktop();
  const locationObj = useLocation();
  const navigate = useNavigate();
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const elapsed = Date.now() - touchStartRef.current.time;

    // A real tap has very little movement and is quick (within 300ms)
    if (dist < 10 && elapsed < 300) {
      e.preventDefault();
      onClick?.();
      const targetPath = isDesktop && active ? "/" : `/cafe/${cafe.slug ?? cafe.id}`;
      const dest = `${targetPath}${locationObj.search}`;
      navigate(dest);
    }
    touchStartRef.current = null;
  };

  // 在 render 時即時計算營業狀態 —— 避免 React Query 把 fetch 當下的時間點固化,
  // 過了打烊時間後列表仍顯示「營業中」、與詳細頁不一致。
  const liveStatus = cafe.business_hours
    ? isCafeOpenAt(cafe.business_hours, new Date())
    : { open_now: cafe.open_now, closes_at: cafe.closes_at ?? null, opens_at: cafe.opens_at ?? null };
  const open_now = liveStatus.open_now;
  const closes_at = liveStatus.closes_at ?? undefined;
  const opens_at = liveStatus.opens_at ?? undefined;
  const dims = {
    sm: "h-14 w-14",
    md: "h-16 w-16",
    lg: "h-24 w-24",
  }[size];

  // 再點一次已選中的項目就回首頁(關閉詳細區塊)。
  return (
    <Link
      to={{
        pathname: isDesktop && active ? "/" : `/cafe/${cafe.slug ?? cafe.id}`,
        search: locationObj.search,
      }}
      onMouseEnter={() => onHover?.(cafe.id)}
      onMouseLeave={() => onHover?.(null)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={() => onClick?.()}
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
              <TagBadge
                key={t}
                variant="neutral"
                size="sm"
                className="!h-[18px] py-0.5 px-1.5 flex items-center"
              >
                {t}
              </TagBadge>
            ))}
          </div>
        )}
        <div
          className={clsx(
            "mt-1 text-[11px] font-medium",
            open_now
              ? "text-success"
              : opens_at
                ? "text-warning"
                : "text-error"
          )}
        >
          {open_now
            ? closes_at
              ? `營業中 · 至 ${closes_at}`
              : "營業中"
            : opens_at
              ? `尚未營業 · ${opens_at} 開門`
              : "已休息"}
        </div>
      </div>
    </Link>
  );
}
