import { useEffect, useMemo, useRef, useState } from "react";
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
  GlobeIcon,
  Cancel01Icon,
  ArrowLeft02Icon,
  ArrowRight02Icon,
} from "@hugeicons/core-free-icons";
import { Cap, Placeholder, StarRating, TagBadge } from "@/components/primitives";
import { TagConfidenceRow } from "@/components/cafe/TagConfidenceRow";
import { AddTagModal } from "@/components/cafe/AddTagModal";
import type { CafeDetail, PlatformTagKey } from "@/types/cafe";
import { useVoteTag, useClearVote, useUserVotesForCafe, useDeleteCafeTag } from "@/hooks/useTagVote";
import { useAuth } from "@/hooks/useAuth";
import { formatDistance, formatPriceLevel, orderHoursFromToday } from "@/lib/format";
import { shareUrl } from "@/lib/share";
import type { CafeActions } from "@/hooks/useCafeActions";

interface CafeDetailContentProps {
  cafe: CafeDetail;
  isDesktop: boolean;
  actions: CafeActions;
  /**
   * 封面圖位置:
   *   "top"        — 預設,放在最上方(桌面與舊版手機行為)。
   *   "mid"        — 放在「AI 摘要」與「行動按鈕」之間。供手機 bottom sheet
   *                  使用,讓使用者把 sheet 上拉時才看到封面,作為向上探索的獎勵。
   */
  coverPlacement?: "top" | "mid";
  /**
   * 點右上 × 關閉的回呼。手機 bottom sheet 模式下會傳入,讓使用者除了手勢之外
   * 也能用按鈕回到上一頁;桌面/不需要關閉按鈕時不傳。
   */
  onClose?: () => void;
  /**
   * 底部 sheet 是否已經展開至最大高度，用來動態決定相簿區域是否能原生縱向滑動/捲動
   */
  isSheetExpanded?: boolean;
}

/** 詳細頁主體 — 桌面中間欄與手機 main 共用。 */
export function CafeDetailContent({
  cafe,
  isDesktop,
  actions,
  coverPlacement = "top",
  onClose,
  isSheetExpanded = false,
}: CafeDetailContentProps) {
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

  // 凍結標籤顯示順序 —— 投票後 confidence 會變,若直接依後端排序會讓列表跳動,
  // 用 ref 在切到這間店時記住一次原始順序,新增的標籤(不在 snapshot 中)接在尾端。
  const orderSnapshot = useRef<{ cafeId: string; keys: PlatformTagKey[] }>({ cafeId: "", keys: [] });
  useEffect(() => {
    if (orderSnapshot.current.cafeId !== cafe.id) {
      orderSnapshot.current = { cafeId: cafe.id, keys: cafe.tags.map((t) => t.key) };
    } else {
      // 同一間店但出現新標籤時,把新 key 追加到尾端,既有順序不動。
      const existing = new Set(orderSnapshot.current.keys);
      for (const t of cafe.tags) {
        if (!existing.has(t.key)) orderSnapshot.current.keys.push(t.key);
      }
    }
  }, [cafe.id, cafe.tags]);

  const stableTags = useMemo(() => {
    const snap = orderSnapshot.current;
    if (snap.cafeId !== cafe.id || snap.keys.length === 0) return cafe.tags;
    const byKey = new Map(cafe.tags.map((t) => [t.key, t]));
    const ordered: typeof cafe.tags = [];
    for (const k of snap.keys) {
      const t = byKey.get(k);
      if (t) {
        ordered.push(t);
        byKey.delete(k);
      }
    }
    // 任何尚未被 snapshot 追上的新標籤接在尾端
    for (const t of byKey.values()) ordered.push(t);
    return ordered;
  }, [cafe.id, cafe.tags]);

  // 手機版地圖連結不加 target,讓系統能用 universal link 跳轉到 Google Maps App。
  const mapLinkProps = cafe.google_url
    ? isDesktop
      ? { href: cafe.google_url, target: "_blank" as const, rel: "noreferrer" }
      : { href: cafe.google_url }
    : null;

  // 把封面與其他照片合併成一條可橫向捲動的相簿。封面放第一張,後面接 photos。
  const allPhotos = useMemo(() => {
    const list: string[] = [];
    if (cafe.cover_url) list.push(cafe.cover_url);
    if (cafe.photos) {
      for (const p of cafe.photos) {
        if (p && p !== cafe.cover_url) list.push(p);
      }
    }
    return list;
  }, [cafe.cover_url, cafe.photos]);

  const cover = allPhotos.length > 0 ? (
    <PhotoGallery photos={allPhotos} isDesktop={isDesktop} isSheetExpanded={isSheetExpanded} />
  ) : (
    <Placeholder ratio="16/9" label="hero" />
  );

  // 行動按鈕區段獨立出來,因為手機 bottom sheet 排版時會夾在「AI 摘要」與「封面」之後。
  const actionButtons = (
    <section className="px-5 pt-4">
      <div className="flex gap-2">
        {user && (
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
        )}
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
  );

  const aiSummary = (
    <>
      <div className="divider mx-5" />
      <section className="px-5">
        <Cap>AI 摘要</Cap>
        <div
          role="status"
          className="alert alert-info bg-base-200 mt-2 text-base-content border border-base-content/10 text-left justify-items-start"
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
    </>
  );

  return (
    <>
      {coverPlacement === "top" && allPhotos.length > 0 && (
        <div className="px-0">{cover}</div>
      )}

      {/* === 1. 咖啡廳資訊 ===
          手機 sheet:把 pt 降到 2,因為上方已有 handle 指示器佔位,留太多 padding 反而鬆散。
          × 按鈕用 -mr-1 把右邊界從 px-5 (20px) 推到 16px,對齊上方搜尋列右側的 user avatar。*/}
      <section className={`px-5 ${coverPlacement === "mid" ? "pt-0" : "pt-5"}`}>
        {coverPlacement !== "mid" && (
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-2xl font-bold tracking-tight flex-1 min-w-0">{cafe.name}</h2>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="關閉"
                className="btn btn-ghost btn-sm btn-square -mt-1 -mr-1 shrink-0 text-base-content/65 hover:text-base-content"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.5} />
              </button>
            )}
          </div>
        )}

        {/* 評分 / 星星 / 評論數 / 價位 */}
        {(cafe.google_rating != null || cafe.price_level) && (
          <div className={`flex items-center gap-2 text-xs text-base-content/70 ${coverPlacement !== "mid" ? "mt-1.5" : ""}`}>
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

        {/* 營業狀態 — 從原本「店名右側」搬到評分與地址之間,
            視覺上比掛在標題旁更平衡,也讓 × 關閉按鈕能固定靠右。 */}
        <div className="mt-2">
          <div
            className={`badge badge-outline ${
              cafe.open_now ? "text-success" : cafe.opens_at ? "text-warning" : "text-error"
            }`}
          >
            {cafe.open_now
              ? cafe.closes_at
                ? `營業中 · ${cafe.closes_at} 打烊`
                : "營業中"
              : cafe.opens_at
                ? `尚未營業 · ${cafe.opens_at} 開門`
                : "已休息"}
          </div>
        </div>

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

      {coverPlacement === "top" ? (
        <>
          {/* === 2. 行動按鈕 → 3. AI 摘要 (預設順序,桌面用) === */}
          {actionButtons}
          {aiSummary}
        </>
      ) : (
        <>
          {/* 手機 bottom sheet 排版:資訊 → 行動按鈕 → 封面 → AI 摘要 → 其他。
              使用者一進詳細頁(預設 50%)就先看到資訊、立刻能操作的功能按鈕;
              再往上拉才看到封面圖,接著才是 AI 摘要與標籤等深入內容。 */}
          {actionButtons}
          <div className="mt-4 px-5">{cover}</div>
          {aiSummary}
        </>
      )}

      <div className="divider mx-5" />
      <section className="px-5">
        <div className="flex items-center justify-between">
          <Cap>標籤與證據</Cap>
          {user && (
            <button
              type="button"
              onClick={() => setIsAddTagOpen(true)}
              title="新增標籤"
              className="btn btn-ghost btn-xs text-primary hover:bg-primary/10 gap-1 rounded-none px-2 font-medium flex items-center"
            >
              <HugeiconsIcon icon={Add01Icon} size={12} strokeWidth={2} />
              新增標籤
            </button>
          )}
        </div>
        {stableTags.length > 0 ? (
          <ul className="mt-2 divide-y divide-base-content/10">
            {stableTags.map((t) => (
              <li key={t.key}>
                <TagConfidenceRow
                  tag={t}
                  userVote={userVotes?.[t.key]}
                  onVote={handleVote}
                  showVoteButtons={!!user}
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

      {(cafe.phone || cafe.website_url) && (
        <>
          <div className="divider mx-5" />
          <section className="px-5">
            <Cap>聯絡與連結</Cap>
            <ul className="menu menu-vertical w-full p-0 mt-2 border-y border-base-content/10 divide-y divide-base-content/10">
              {cafe.phone && (
                <LinkItem icon={Call02Icon} label={cafe.phone} href={`tel:${cafe.phone}`} />
              )}
              {cafe.website_url && (() => {
                const isIg = /(?:^|\.)instagram\.com\//i.test(cafe.website_url);
                return (
                  <LinkItem
                    icon={isIg ? InstagramIcon : GlobeIcon}
                    label={isIg ? "Instagram" : "官方網站"}
                    href={cafe.website_url}
                    external
                  />
                );
              })()}
            </ul>
          </section>
        </>
      )}

      {/* === 4. 回報問題(放最底,僅登入使用者可見) === */}
      {user && (
        <section className="px-5 pt-6 pb-8">
          <button
            type="button"
            onClick={openReport}
            className="btn btn-ghost btn-sm w-full gap-1.5 rounded-none text-base-content/55 hover:text-base-content"
          >
            <HugeiconsIcon icon={AlertCircleIcon} size={14} strokeWidth={1.5} />
            回報問題
          </button>
        </section>
      )}

      <AddTagModal
        isOpen={isAddTagOpen}
        onClose={() => setIsAddTagOpen(false)}
        cafeId={cafe.id}
        existingTags={cafe.tags.map((t) => t.key)}
      />
    </>
  );
}

/**
 * 單張圖片元件 — 包含 Skeleton 載入與漸變動畫,以避免 Layout Shift
 */
interface GalleryImageProps {
  src: string;
  isLazy: boolean;
  fetchPriority?: "high" | "low";
  onLoad: () => void;
}

function GalleryImage({ src, isLazy, fetchPriority, onLoad }: GalleryImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <div
      className={`relative h-full shrink-0 select-none overflow-hidden rounded-lg bg-base-200 transition-all duration-300 ${
        isLoaded ? "" : "w-64 sm:w-72 md:w-80"
      }`}
    >
      {/* Skeleton 佔位與載入/錯誤狀態的 Fallback UI */}
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-base-300/40 skeleton">
          {hasError ? (
            <HugeiconsIcon icon={AlertCircleIcon} className="text-base-content/20" size={24} />
          ) : (
            <div className="w-full h-full bg-base-200 animate-pulse" />
          )}
        </div>
      )}

      {!hasError && (
        <img
          src={src}
          alt=""
          loading={isLazy ? "lazy" : undefined}
          // @ts-ignore: 支援 React 18+ 版本的 fetchpriority 屬性
          fetchpriority={fetchPriority}
          draggable={false}
          onLoad={() => {
            setIsLoaded(true);
            onLoad();
          }}
          onError={() => {
            setHasError(true);
            onLoad();
          }}
          className={`h-full w-auto object-cover transition-opacity duration-300 ${
            isLoaded ? "opacity-100" : "opacity-0 absolute pointer-events-none w-0 h-0"
          }`}
        />
      )}
    </div>
  );
}

/**
 * 圖片畫廊 — 像手機版 Google Maps:所有照片等高、水平接在一起,
 * 用 overflow-x-auto 處理觸控板/觸控手勢;桌面在 hover 時把滾輪 deltaY
 * 轉成水平捲動,並在還有未顯示內容的那一側畫一道漸層提示。
 */
function PhotoGallery({
  photos,
  isDesktop,
  isSheetExpanded = false,
}: {
  photos: string[];
  isDesktop: boolean;
  isSheetExpanded?: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  // 紀錄左右是否還能再捲,用來決定桌面版箭頭按鈕的顯隱。
  const [edges, setEdges] = useState({ atStart: true, atEnd: false });

  // 用於記錄和鎖定手勢方向的 Ref，避免在 touchmove 時觸發 React 重繪以提昇效能
  const gestureRef = useRef<{
    startX: number;
    startY: number;
    direction: "horizontal" | "vertical" | null;
  } | null>(null);

  const handleGestureStart = (clientX: number, clientY: number) => {
    gestureRef.current = {
      startX: clientX,
      startY: clientY,
      direction: null,
    };
  };

  const handleGestureMove = (
    clientX: number,
    clientY: number,
    e: React.TouchEvent | React.PointerEvent
  ) => {
    if (!gestureRef.current) return;
    const dx = clientX - gestureRef.current.startX;
    const dy = clientY - gestureRef.current.startY;

    // 當滑動距離大於 5px 時鎖定方向
    if (gestureRef.current.direction === null) {
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (absX > 5 || absY > 5) {
        // 仿 Google Maps:垂直判定門檻拉高,只有「明顯陡直」才算垂直,
        // 否則一律當水平。這樣在 iPad 等大螢幕上,使用者手指自然斜滑時
        // 不會頻繁誤判成垂直,避免 Bottom Sheet 隨手指抖動。
        const VERTICAL_SLOPE_THRESHOLD = 3.5;
        if (absY > absX * VERTICAL_SLOPE_THRESHOLD) {
          gestureRef.current.direction = "vertical";
        } else {
          gestureRef.current.direction = "horizontal";
        }
      }
      // 在方向判定出來之前，一律阻斷冒泡，避免底層 Bottom Sheet 搶先捕捉並產生微小位移
      e.stopPropagation();
    } else if (gestureRef.current.direction === "horizontal") {
      // 水平滑動時阻斷事件冒泡，防止底層 Bottom Sheet 被拖動 or 收縮
      e.stopPropagation();
    }
  };

  const handleGestureEnd = () => {
    gestureRef.current = null;
  };

  const recomputeEdges = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const atStart = el.scrollLeft <= 1;
    const atEnd = maxScroll <= 1 || el.scrollLeft >= maxScroll - 1;
    setEdges((prev) =>
      prev.atStart === atStart && prev.atEnd === atEnd ? prev : { atStart, atEnd }
    );
  };

  useEffect(() => {
    recomputeEdges();
    const ro = new ResizeObserver(recomputeEdges);
    if (scrollerRef.current) ro.observe(scrollerRef.current);
    return () => ro.disconnect();
  }, [photos.length]);

  useEffect(() => {
    setEdges({ atStart: true, atEnd: false });
  }, [photos]);

  // 桌面:把垂直滾輪轉成水平捲動。React 的 onWheel 在 React 17+ 是 passive
  // listener,呼叫 preventDefault 會被瀏覽器忽略並印警告,所以用原生
  // addEventListener 加上 { passive: false } 來綁。
  useEffect(() => {
    if (!isDesktop) return;
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const { deltaX, deltaY } = e;
      if (Math.abs(deltaY) <= Math.abs(deltaX)) return;
      const maxScroll = el.scrollWidth - el.clientWidth;
      const goingRight = deltaY > 0;
      const canScroll = goingRight ? el.scrollLeft < maxScroll - 1 : el.scrollLeft > 1;
      if (!canScroll) return;
      e.preventDefault();
      el.scrollLeft += deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [isDesktop]);

  // 以「圖片中心對齊容器中心」為基準捲動:先找出目前最接近正中央的區塊,
  // 點擊後改為將下一張(或上一張)置中。若已到最前/最後沒辦法置中,
  // scrollTo 會被瀏覽器自動 clamp 到邊界,維持自然的邊緣行為。
  const scrollByPage = (direction: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const items = Array.from(el.children) as HTMLElement[];
    if (items.length === 0) return;
    const viewportCenter = el.scrollLeft + el.clientWidth / 2;
    // 找目前最接近中央的圖片區塊 index
    let currentIdx = 0;
    let minDist = Infinity;
    items.forEach((item, i) => {
      const center = item.offsetLeft + item.offsetWidth / 2;
      const dist = Math.abs(center - viewportCenter);
      if (dist < minDist) {
        minDist = dist;
        currentIdx = i;
      }
    });
    const targetIdx = Math.max(0, Math.min(items.length - 1, currentIdx + direction));
    const targetItem = items[targetIdx];
    const targetCenter = targetItem.offsetLeft + targetItem.offsetWidth / 2;
    el.scrollTo({ left: targetCenter - el.clientWidth / 2, behavior: "smooth" });
  };

  return (
    <div className="relative group">
      <div
        ref={scrollerRef}
        data-no-sheet-expand=""
        data-vaul-no-drag=""
        onScroll={recomputeEdges}
        onTouchStart={(e) => handleGestureStart(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={(e) => handleGestureMove(e.touches[0].clientX, e.touches[0].clientY, e)}
        onTouchEnd={handleGestureEnd}
        onTouchCancel={handleGestureEnd}
        onPointerDown={(e) => handleGestureStart(e.clientX, e.clientY)}
        onPointerMove={(e) => handleGestureMove(e.clientX, e.clientY, e)}
        onPointerUp={handleGestureEnd}
        onPointerCancel={handleGestureEnd}
        style={{ touchAction: isSheetExpanded ? "pan-x pan-y" : "pan-x" }}
        className="flex gap-2 overflow-x-auto h-48 sm:h-56 md:h-64 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {photos.map((src, i) => (
          <GalleryImage
            key={i}
            src={src}
            isLazy={i > 0}
            fetchPriority={i === 0 ? "high" : "low"}
            onLoad={recomputeEdges}
          />
        ))}
      </div>
      {isDesktop && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={() => scrollByPage(-1)}
            className={`absolute left-2 top-1/2 -translate-y-1/2 z-10 grid place-items-center h-7 w-7 rounded-full bg-base-100/90 text-base-content shadow-md backdrop-blur-sm transition-opacity duration-200 hover:bg-base-100 ${
              edges.atStart ? "opacity-0 pointer-events-none" : "opacity-100"
            }`}
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} size={14} />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={() => scrollByPage(1)}
            className={`absolute right-2 top-1/2 -translate-y-1/2 z-10 grid place-items-center h-7 w-7 rounded-full bg-base-100/90 text-base-content shadow-md backdrop-blur-sm transition-opacity duration-200 hover:bg-base-100 ${
              edges.atEnd ? "opacity-0 pointer-events-none" : "opacity-100"
            }`}
          >
            <HugeiconsIcon icon={ArrowRight02Icon} size={14} />
          </button>
        </>
      )}
    </div>
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
