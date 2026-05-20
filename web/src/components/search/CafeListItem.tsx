import { Link } from "react-router-dom";
import { Placeholder, TagBadge } from "@/components/primitives";
import type { CafeCard } from "@/types/cafe";
import clsx from "@/lib/clsx";

interface CafeListItemProps {
  cafe: CafeCard;
  index?: number;
  active?: boolean;
  size?: "sm" | "md" | "lg";
  onHover?: (id: string | null) => void;
}

/** 列表項 — 桌面 (lg) / 手機 (sm/md) 共用。 */
export function CafeListItem({
  cafe,
  index,
  active,
  size = "md",
  onHover,
}: CafeListItemProps) {
  const dims = {
    sm: "h-14 w-14",
    md: "h-16 w-16",
    lg: "h-24 w-24",
  }[size];

  return (
    <Link
      to={`/cafe/${cafe.id}`}
      onMouseEnter={() => onHover?.(cafe.id)}
      onMouseLeave={() => onHover?.(null)}
      className={clsx(
        "flex gap-3 px-4 py-3 transition-colors hover:bg-base-200",
        active && "bg-base-200",
      )}
    >
      <Placeholder className={clsx(dims, "shrink-0")} ratio="square" label="img" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={clsx("truncate font-semibold", size === "lg" ? "text-base" : "text-sm")}>
            {index !== undefined && <span className="text-base-content/45 mr-1">{index}.</span>}
            {cafe.name}
          </span>
          <span className="font-mono text-xs text-base-content/55 shrink-0">
            {cafe.distance_km}km
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
