import { HugeiconsIcon } from "@hugeicons/react";
import {
  InstagramIcon,
  Call02Icon,
  Location01Icon,
  BookmarkAdd01Icon,
  BookmarkCheck01Icon,
  AlertCircleIcon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { Cap, Placeholder, TagBadge } from "@/components/primitives";
import { TagConfidenceRow } from "@/components/cafe/TagConfidenceRow";
import type { CafeDetail } from "@/types/cafe";
import { useVoteTag, useClearVote, useUserVotesForCafe } from "@/hooks/useTagVote";
import { useAuth } from "@/hooks/useAuth";
import { formatDistance, orderHoursFromToday } from "@/lib/format";
import type { CafeActions } from "@/hooks/useCafeActions";

interface CafeDetailContentProps {
  cafe: CafeDetail;
  isDesktop: boolean;
  actions: CafeActions;
}

/** 詳細頁主體 — 桌面中間欄與手機 main 共用。 */
export function CafeDetailContent({ cafe, isDesktop, actions }: CafeDetailContentProps) {
  const { user } = useAuth();
  const { data: userVotes } = useUserVotesForCafe(user ? cafe.id : null);
  const voteMutation = useVoteTag();
  const clearVoteMutation = useClearVote();

  const { inPocket, pocketLabel, pocketDisabled, handlePocketClick, openReport } = actions;

  const handleVote = (key: string, vote: "up" | "down") => {
    if (!user) return;
    const v: 1 | -1 = vote === "up" ? 1 : -1;
    const current = userVotes?.[key];
    if (current === v) {
      clearVoteMutation.mutate({ cafeId: cafe.id, tagKey: key });
    } else {
      voteMutation.mutate({ cafeId: cafe.id, tagKey: key, vote: v });
    }
  };

  const topTags = cafe.top_tags ?? [];
  const orderedHours = orderHoursFromToday(cafe.hours);

  // 手機版地圖連結不加 target,讓系統能用 universal link 跳轉到 Google Maps App。
  const mapLinkProps = cafe.google_url
    ? isDesktop
      ? { href: cafe.google_url, target: "_blank" as const, rel: "noreferrer" }
      : { href: cafe.google_url }
    : null;

  return (
    <>
      {cafe.cover_url ? (
        <div className="aspect-[16/9] w-full overflow-hidden bg-base-200">
          <img src={cafe.cover_url} alt="" className="h-full w-full object-cover" />
        </div>
      ) : (
        <Placeholder ratio="16/9" label="hero" />
      )}

      {/* === 1. 咖啡廳資訊 === */}
      <section className="px-5 pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-2xl font-bold tracking-tight">{cafe.name}</h2>
          <div
            className={`badge badge-outline ${cafe.open_now ? "text-success" : "text-base-content/55"}`}
          >
            {cafe.open_now
              ? cafe.closes_at
                ? `營業中 · ${cafe.closes_at} 打烊`
                : "營業中"
              : "今日已休"}
          </div>
        </div>

        {/* 評分 + 距離 */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-base-content/65">
          {cafe.google_rating != null && (
            <span className="inline-flex items-center gap-1 font-mono">
              <HugeiconsIcon icon={StarIcon} size={12} strokeWidth={1.5} className="text-warning" />
              {cafe.google_rating.toFixed(1)}
              <span className="text-base-content/45">/ Google</span>
            </span>
          )}
          {cafe.distance_km != null && (
            <span className="font-mono">{formatDistance(cafe.distance_km)}</span>
          )}
        </div>

        {/* 地址 — 直接做為地圖連結 */}
        {mapLinkProps ? (
          <a
            {...mapLinkProps}
            className="mt-2 -mx-1 flex items-start gap-1.5 rounded px-1 py-0.5 text-xs text-base-content/70 hover:bg-base-200 hover:text-base-content transition-colors"
          >
            <HugeiconsIcon
              icon={Location01Icon}
              size={13}
              strokeWidth={1.5}
              className="mt-px shrink-0 text-base-content/55"
            />
            <span className="flex-1 leading-relaxed">{cafe.address}</span>
            <span className="shrink-0 text-[11px] text-base-content/45 underline-offset-2 hover:underline">
              在 Google Maps 開啟
            </span>
          </a>
        ) : (
          <p className="mt-1 text-xs text-base-content/55">{cafe.address}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {topTags.map((t) => (
            <TagBadge key={t} variant="neutral">
              {t}
            </TagBadge>
          ))}
        </div>
      </section>

      {/* === 2. 加入口袋 === */}
      <section className="px-5 pt-4">
        <button
          type="button"
          onClick={handlePocketClick}
          disabled={pocketDisabled}
          className={`btn btn-sm w-full gap-1.5 rounded-none ${inPocket ? "btn-outline" : "btn-neutral"}`}
        >
          <HugeiconsIcon
            icon={inPocket ? BookmarkCheck01Icon : BookmarkAdd01Icon}
            size={14}
            strokeWidth={1.5}
          />
          {pocketLabel}
        </button>
      </section>

      {/* === 3. AI 摘要 === */}
      <div className="divider mx-5" />
      <section className="px-5">
        <Cap>AI 摘要</Cap>
        <div
          role="status"
          className="alert alert-info bg-base-200 mt-2 text-base-content border border-base-content/10"
        >
          {cafe.ai_summary ? (
            <span className="text-sm leading-relaxed">{cafe.ai_summary}</span>
          ) : (
            <span className="text-sm leading-relaxed text-base-content/55">
              這間店的 AI 摘要還在準備中，敬請期待。
            </span>
          )}
        </div>
      </section>

      {cafe.tags.length > 0 && (
        <>
          <div className="divider mx-5" />
          <section className="px-5">
            <Cap>標籤與證據</Cap>
            <ul className="mt-2 divide-y divide-base-content/10">
              {cafe.tags.map((t) => (
                <li key={t.key}>
                  <TagConfidenceRow
                    tag={t}
                    userVote={userVotes?.[t.key]}
                    onVote={handleVote}
                  />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {orderedHours.length > 0 && (
        <>
          <div className="divider mx-5" />
          <section className="px-5">
            <Cap>營業時間</Cap>
            <dl className="mt-2 divide-y divide-base-content/10">
              {orderedHours.map(({ label, hours, isToday }) => (
                <div
                  key={label}
                  className={`flex justify-between py-1.5 text-sm ${isToday ? "font-semibold" : ""}`}
                >
                  <dt className={isToday ? "text-base-content" : "text-base-content/65"}>
                    {label}
                    {isToday && <span className="ml-2 text-xs text-success">今日</span>}
                  </dt>
                  <dd className={`font-mono text-xs ${isToday ? "text-base-content" : "text-base-content/80"}`}>
                    {hours}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </>
      )}

      {(cafe.phone || cafe.ig_url) && (
        <>
          <div className="divider mx-5" />
          <section className="px-5">
            <Cap>聯絡與連結</Cap>
            <ul className="menu menu-vertical w-full p-0 mt-2 border-y border-base-content/10 divide-y divide-base-content/10">
              {cafe.phone && (
                <LinkItem icon={Call02Icon} label={cafe.phone} href={`tel:${cafe.phone}`} />
              )}
              {cafe.ig_url && (
                <LinkItem icon={InstagramIcon} label="Instagram" href={cafe.ig_url} external />
              )}
            </ul>
          </section>
        </>
      )}

      {/* === 4. 回報問題(放最底) === */}
      <section className="px-5 pt-6 pb-8">
        <button
          type="button"
          onClick={openReport}
          disabled={!user}
          className="btn btn-ghost btn-sm w-full gap-1.5 rounded-none text-base-content/55 hover:text-base-content"
        >
          <HugeiconsIcon icon={AlertCircleIcon} size={14} strokeWidth={1.5} />
          回報問題
        </button>
      </section>
    </>
  );
}

function LinkItem({
  icon,
  label,
  href,
  external,
}: {
  icon: typeof Call02Icon;
  label: string;
  href?: string;
  external?: boolean;
}) {
  const inner = (
    <span className="flex w-full items-center gap-3 px-2 py-2.5">
      <HugeiconsIcon icon={icon} size={16} strokeWidth={1.5} className="text-base-content/65" />
      <span className="flex-1 text-sm">{label}</span>
    </span>
  );
  return (
    <li className="block">
      {href ? (
        <a href={href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
          {inner}
        </a>
      ) : (
        <span>{inner}</span>
      )}
    </li>
  );
}
