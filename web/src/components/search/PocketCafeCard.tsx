import { Link } from "react-router-dom";
import { Placeholder, StarRating, TagBadge } from "@/components/primitives";
import type { CafeCard } from "@/types/cafe";
import { isCafeOpenAt } from "@/lib/format";
import { formatPriceLevel } from "@/lib/format";
import clsx from "@/lib/clsx";

interface PocketCafeCardProps {
  cafe: CafeCard;
  personalNote?: string | null;
  detailSearch?: string;
}

/**
 * 口袋名單專用卡片 — 顯示封面、名稱、營業狀態、星評、評論數、價位、地址、標籤。
 */
export function PocketCafeCard({ cafe, personalNote, detailSearch = "" }: PocketCafeCardProps) {
  // 即時計算營業狀態（避免 React Query 快取讓狀態過時）
  const liveStatus = cafe.business_hours
    ? isCafeOpenAt(cafe.business_hours, new Date())
    : { open_now: cafe.open_now, closes_at: cafe.closes_at ?? null, opens_at: cafe.opens_at ?? null };

  const open_now = liveStatus.open_now;
  const closes_at = liveStatus.closes_at;
  const opens_at = liveStatus.opens_at;

  const priceLabel = formatPriceLevel(cafe.price_level ?? null);

  return (
    <Link
      to={`/cafe/${cafe.slug ?? cafe.id}${detailSearch}`}
      className="flex gap-3 px-4 py-3 transition-colors hover:bg-base-200/60 active:bg-base-200"
    >
      {/* 封面圖 */}
      {cafe.cover_url ? (
        <img
          src={cafe.cover_url}
          alt=""
          loading="lazy"
          className="h-20 w-20 shrink-0 rounded-sm object-cover bg-base-200"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <Placeholder className="h-20 w-20 shrink-0 rounded-sm" ratio="square" label="img" />
      )}

      {/* 文字區 */}
      <div className="min-w-0 flex-1">
        {/* 店名 + 營業狀態 */}
        <div className="flex items-start justify-between gap-2">
          <span className="font-semibold leading-tight text-sm truncate">{cafe.name}</span>
          <span
            className={clsx(
              "shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full border",
              open_now
                ? "text-success border-success/40 bg-success/10"
                : opens_at
                  ? "text-warning border-warning/40 bg-warning/10"
                  : "text-error border-error/40 bg-error/10",
            )}
          >
            {open_now
              ? closes_at
                ? `營業中 · ${closes_at} 打烊`
                : "營業中"
              : opens_at
                ? `${opens_at} 開門`
                : "已休息"}
          </span>
        </div>

        {/* 評分列 */}
        {cafe.google_rating != null && (
          <div className="mt-0.5 flex items-center gap-1.5 text-xs">
            <span className="font-mono font-semibold text-base-content">
              {cafe.google_rating.toFixed(1)}
            </span>
            <StarRating value={cafe.google_rating} size={11} />
            {cafe.google_review_count != null && (
              <span className="text-base-content/50 font-mono">
                ({cafe.google_review_count.toLocaleString()})
              </span>
            )}
            {priceLabel && (
              <span className=" font-mono text-base-content/60">· {priceLabel}</span>
            )}
          </div>
        )}

        {/* 地址 */}
        {cafe.address && (
          <div className="mt-1 flex items-start gap-1 text-[11px] text-base-content/55 leading-tight">
            <span className="truncate">{cafe.address}</span>
          </div>
        )}

        {/* 標籤 */}
        {cafe.top_tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {cafe.top_tags.map((t) => (
              <TagBadge key={t} variant="ghost" size="sm">
                {t}
              </TagBadge>
            ))}
          </div>
        )}

        {/* 個人備註 */}
        {personalNote && (
          <p className="mt-1 text-[11px] text-base-content/50 italic">✎ {personalNote}</p>
        )}
      </div>
    </Link>
  );
}
