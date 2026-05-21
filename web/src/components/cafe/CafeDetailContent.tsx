import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  InstagramIcon,
  Call02Icon,
  Location01Icon,
  Bookmark02Icon,
  BookmarkCheck02Icon,
  AlertCircleIcon,
  LinkForwardIcon,
  Navigation03Icon,
  Add01Icon,
} from "@hugeicons/core-free-icons";
import { Cap, Placeholder, StarRating, TagBadge } from "@/components/primitives";
import { TagConfidenceRow } from "@/components/cafe/TagConfidenceRow";
import { AddTagModal } from "@/components/cafe/AddTagModal";
import type { CafeDetail } from "@/types/cafe";
import { useVoteTag, useClearVote, useUserVotesForCafe, useDeleteCafeTag } from "@/hooks/useTagVote";
import { useAuth } from "@/hooks/useAuth";
import { formatDistance, formatPriceLevel, orderHoursFromToday } from "@/lib/format";
import { shareUrl } from "@/lib/share";
import type { CafeActions } from "@/hooks/useCafeActions";

interface CafeDetailContentProps {
  cafe: CafeDetail;
  isDesktop: boolean;
  actions: CafeActions;
}

/** 詳細頁主體 — 桌面中間欄與手機 main 共用。 */
export function CafeDetailContent({ cafe, isDesktop, actions }: CafeDetailContentProps) {
  const { user } = useAuth();
  const [isAddTagOpen, setIsAddTagOpen] = useState(false);
  const { data: userVotes } = useUserVotesForCafe(user ? cafe.id : null);
  const voteMutation = useVoteTag();
  const clearVoteMutation = useClearVote();
  const deleteTagMutation = useDeleteCafeTag();

  const { inPocket, pocketLabel, pocketDisabled, handlePocketClick, openReport } = actions;

  const handleVote = (key: string, vote: "up" | "down") => {
    if (!user) return;
    const v: 1 | -1 = vote === "up" ? 1 : -1;
    const current = userVotes?.[key];
    if (current === v) {
      if (v === 1) {
        // "再次點擊選中的讚 會移除這個標籤"
        // 只有當該標籤是自己新增的（無結構化證據，且無其他人的贊同票）才完全移除該標籤，否則僅清除自己的投票。
        const tagObj = cafe.tags.find((t) => t.key === key);
        const detailObj = cafe.tags_detail?.find((t) => t.key === key);
        const isUserAdded = tagObj
          ? tagObj.evidence_count === 0 && (!detailObj || detailObj.vote_up <= 1)
          : false;

        if (isUserAdded) {
          deleteTagMutation.mutate({ cafeId: cafe.id, tagKey: key });
        } else {
          clearVoteMutation.mutate({ cafeId: cafe.id, tagKey: key });
        }
      } else {
        clearVoteMutation.mutate({ cafeId: cafe.id, tagKey: key });
      }
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
            className={`badge badge-outline ${cafe.open_now ? "text-success" : "text-error"}`}
          >
            {cafe.open_now
              ? cafe.closes_at
                ? `營業中 · ${cafe.closes_at} 打烊`
                : "營業中"
              : "已休息"}
          </div>
        </div>

        {/* 評分 / 星星 / 評論數 / 價位 */}
        {(cafe.google_rating != null || cafe.price_level) && (
          <div className="mt-1.5 flex items-center gap-2 text-xs text-base-content/70">
            {cafe.google_rating != null && (
              <>
                <span className="font-mono text-sm font-semibold text-base-content">
                  {cafe.google_rating.toFixed(1)}
                </span>
                <StarRating value={cafe.google_rating} size={14} />
                {cafe.google_review_count != null && (
                  <span className="font-mono text-base-content/55">
                    ({cafe.google_review_count.toLocaleString()})
                  </span>
                )}
              </>
            )}
            {formatPriceLevel(cafe.price_level) && (
              <span className="ml-auto font-mono text-base-content/75">
                {formatPriceLevel(cafe.price_level)}
              </span>
            )}
          </div>
        )}

        {/* 距離 */}
        {cafe.distance_km != null && cafe.distance_km > 0 && (
          <div className="mt-1 text-xs font-mono text-base-content/55">
            {formatDistance(cafe.distance_km)}
          </div>
        )}

        {/* 地址 */}
        <div className="mt-2 flex items-start gap-1.5 px-1 text-xs text-base-content/70">
          <HugeiconsIcon
            icon={Location01Icon}
            size={13}
            strokeWidth={1.5}
            className="mt-px shrink-0 text-base-content/55"
          />
          <span className="flex-1 leading-relaxed">{cafe.address}</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {topTags.map((t) => (
            <TagBadge key={t} variant="neutral" size="md">
              {t}
            </TagBadge>
          ))}
        </div>
      </section>

      {/* === 2. 行動按鈕：加入口袋 / 分享 / Google 導航 === */}
      <section className="px-5 pt-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handlePocketClick}
            disabled={pocketDisabled}
            className={`btn btn-sm flex-1 gap-1.5 rounded-none ${inPocket ? "btn-neutral" : "btn-outline"}`}
          >
            <HugeiconsIcon
              icon={inPocket ? BookmarkCheck02Icon : Bookmark02Icon}
              size={14}
              strokeWidth={1.5}
            />
            <span className="truncate">{pocketLabel}</span>
          </button>
          <button
            type="button"
            onClick={() => shareUrl(window.location.href, cafe.name)}
            className="btn btn-sm btn-outline flex-1 gap-1.5 rounded-none"
            aria-label="分享咖啡廳"
          >
            <HugeiconsIcon icon={LinkForwardIcon} size={14} strokeWidth={1.5} />
            <span className="truncate">分享</span>
          </button>
          {mapLinkProps ? (
            <a
              {...mapLinkProps}
              className="btn btn-sm btn-outline flex-1 gap-1.5 rounded-none"
              aria-label="在 Google Maps 開啟"
            >
              <HugeiconsIcon icon={Navigation03Icon} size={14} strokeWidth={1.5} />
              <span className="truncate">地圖開啟</span>
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="btn btn-sm btn-outline flex-1 gap-1.5 rounded-none"
            >
              <HugeiconsIcon icon={Navigation03Icon} size={14} strokeWidth={1.5} />
              <span className="truncate">地圖開啟</span>
            </button>
          )}
        </div>
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

      <div className="divider mx-5" />
      <section className="px-5">
        <div className="flex items-center justify-between">
          <Cap>標籤與證據</Cap>
          <button
            type="button"
            onClick={() => setIsAddTagOpen(true)}
            disabled={!user}
            title={user ? "新增標籤" : "請先登入以新增標籤"}
            className="btn btn-ghost btn-xs text-primary hover:bg-primary/10 gap-1 rounded-none px-2 font-medium flex items-center disabled:opacity-50"
          >
            <HugeiconsIcon icon={Add01Icon} size={12} strokeWidth={2} />
            新增標籤
          </button>
        </div>
        {cafe.tags.length > 0 ? (
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
        ) : (
          <p className="mt-3 text-xs text-base-content/50 italic leading-relaxed text-center py-4 bg-base-200/30 border border-dashed border-base-content/10">
            目前這間店還沒有任何標籤。<br />點擊「新增標籤」來幫忙建立第一個吧！
          </p>
        )}
      </section>

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

      <AddTagModal
        isOpen={isAddTagOpen}
        onClose={() => setIsAddTagOpen(false)}
        cafeId={cafe.id}
        existingTags={cafe.tags.map((t) => t.key)}
      />
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
