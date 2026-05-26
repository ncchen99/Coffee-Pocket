import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, Loading03Icon, StarIcon } from "@hugeicons/core-free-icons";
import { TagChip } from "@/components/primitives";
import { parsePrompt } from "@/lib/api";
import { TAG_LABEL_TO_KEY } from "@/data/filterTags";
import { useAllCafes } from "@/hooks/useCafes";
import { searchCafesLocal } from "@/lib/cafeFilter";
import { useUserLocation } from "@/context/UserLocationContext";
import { formatDistance, isCafeOpenAt } from "@/lib/format";
import type { CafeCard } from "@/types/cafe";

/** 完全等於某個標籤 label（去除多餘空白）→ 直接套用該標籤。 */
function matchTagLabelKey(q: string): string | null {
  const trimmed = q.replace(/\s+/g, "");
  // 直接比對
  if (TAG_LABEL_TO_KEY[trimmed]) return TAG_LABEL_TO_KEY[trimmed];
  // 容忍 Wi-Fi / wifi 大小寫
  const lower = trimmed.toLowerCase();
  for (const [label, key] of Object.entries(TAG_LABEL_TO_KEY)) {
    if (label.toLowerCase() === lower) return key;
  }
  return null;
}

const PROMPT_TAGS: { key: string; label: string; accent?: boolean }[] = [
  { key: "no_limit", label: "不限時" },
  { key: "socket", label: "有插座" },
  { key: "study", label: "適合讀書" },
  { key: "late_night", label: "22:00 後" },
  { key: "near_3km", label: "3km 內" },
  { key: "chat", label: "適合聊天" },
];

/** 「22:00 後」chip 觸發的時間點 — 以臺灣時區 (UTC+8) 今天 22:00 為基準。 */
function todayAt22(): string {
  const now = new Date();
  const taipei = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const y = taipei.getFullYear();
  const m = String(taipei.getMonth() + 1).padStart(2, "0");
  const d = String(taipei.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}T22:00:00+08:00`;
}

interface PromptHeroProps {
  query: string;
  onQueryChange: (v: string) => void;
  selected: Set<string>;
  onToggle: (key: string) => void;
  /**
   * 提交時呼叫。
   * - parsedTags / softTags / openAt / distanceKm：場景 / LLM 解析結果。
   * - keyword：若不為 null，表示走「店名 / 地址關鍵字搜尋」，其他欄位通常為空。
   */
  onSubmit: (
    parsedTags: string[],
    softTags: string[],
    openAt: string | null,
    distanceKm: number | null,
    keyword?: string | null,
  ) => void;
  onClear?: () => void;
  compact?: boolean;
  /** 顯示輸入框下方的即時搜尋結果（手機首頁用）。點擊跳轉到該咖啡廳。 */
  showInlineResults?: boolean;
  /** 聚焦時清掉已勾選的標籤 / 時間 — 避免使用者打字搜尋時被先前的條件過濾掉。 */
  onClearTagsOnFocus?: () => void;
  /** 目前的時間篩選；與「22:00 後」chip 雙向綁定。 */
  openAt?: string | null;
  onOpenAtChange?: (val: string | null) => void;
  /** 距離篩選；與「3km 內」chip 雙向綁定。 */
  radiusM?: number | null;
  onRadiusMChange?: (val: number | null) => void;
  /**
   * 外部觸發清除提示文字。每次值改變（遞增計數或時間戳）時，
   * 清掉「找到 N 間店…」等 hint，避免切換標籤 / 場景後顯示舊的搜尋狀態。
   */
  resetHintTrigger?: number;
}

/** 對話式 hero — 桌面 (compact) / 手機共用。 */
export function PromptHero({
  query,
  onQueryChange,
  selected,
  onToggle,
  onSubmit,
  onClear,
  compact = false,
  openAt,
  onOpenAtChange,
  radiusM,
  onRadiusMChange,
  resetHintTrigger,
  showInlineResults = false,
  onClearTagsOnFocus,
}: PromptHeroProps) {
  const routerLocation = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInputFocus = () => {
    if (!showInlineResults) return;
    // 清掉先前選中的標籤 / 時間，避免和打字搜尋互相干擾。
    if (selected.size > 0 || openAt) {
      onClearTagsOnFocus?.();
    }
    // 把輸入框捲到視窗最上，騰出空間給結果清單，避免被鍵盤蓋掉。
    window.requestAnimationFrame(() => {
      inputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  const lateNightTarget = todayAt22();
  const isLateNightActive = openAt === lateNightTarget;
  const isNear3kmActive = radiusM === 3000;
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [lastSubmittedQuery, setLastSubmittedQuery] = useState("");

  // 即時本地搜尋：算當下 query 在 200 筆全量裡有幾筆符合，
  // 用於 (1) 在輸入時顯示「找到 N 間」提示；(2) Enter 時判斷要不要打 AI。
  const allCafes = useAllCafes();
  const { location, requestLocation } = useUserLocation();
  const liveMatchCount = (() => {
    const q = query.trim();
    if (!q) return 0;
    return searchCafesLocal(allCafes.data, {
      userLng: location?.lng ?? null,
      userLat: location?.lat ?? null,
      q,
    }).length;
  })();

  // 即時下拉結果（手機首頁用）— 用綜合排序，截前 6 筆。
  const inlineResults: CafeCard[] = (() => {
    if (!showInlineResults) return [];
    const q = query.trim();
    const hasFilter = q.length > 0 || selected.size > 0 || !!openAt;
    if (!hasFilter) return [];
    return searchCafesLocal(allCafes.data, {
      tags: Array.from(selected),
      userLng: location?.lng ?? null,
      userLat: location?.lat ?? null,
      q: q || null,
      openAt: openAt ?? null,
      sort: "smart",
    }).slice(0, 6);
  })();

  // 外部（chip / 場景點擊）觸發 → 清除 hint。
  // 用 ref 跳過 mount 時的初始執行（trigger=0 不應清除）。
  const prevResetRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (prevResetRef.current !== undefined && resetHintTrigger !== prevResetRef.current) {
      setHint(null);
      setLastSubmittedQuery("");
    }
    prevResetRef.current = resetHintTrigger;
  }, [resetHintTrigger]);

  const handleSubmit = async () => {
    const q = query.trim();
    if (!q) {
      // 沒輸入文字：把當下已勾選的 tag / openAt 當作搜尋條件提交。
      setLastSubmittedQuery("");
      onSubmit(Array.from(selected), [], openAt ?? null, radiusM != null ? radiusM / 1000 : null, null);
      return;
    }

    // 1. 完全命中標籤 label（如「有插座」「適合讀書」）→ 套用標籤，無需後端。
    const labelKey = matchTagLabelKey(q);
    if (labelKey) {
      setHint(`已套用標籤「${q}」`);
      setLastSubmittedQuery(q);
      onSubmit([labelKey], [], null, radiusM != null ? radiusM / 1000 : null, null);
      return;
    }

    // 2. 本地已經有命中 → 不打 AI。輸入時 liveKeyword 已即時 filter，
    //    這裡只把 keyword 固化成 state (給 URL 分享 / 後端 RPC 模式用)。
    if (liveMatchCount > 0) {
      setHint(`找到 ${liveMatchCount} 間店名 / 地址含「${q}」`);
      setLastSubmittedQuery(q);
      onSubmit([], [], null, radiusM != null ? radiusM / 1000 : null, q);
      return;
    }

    // 3. 本地完全找不到 → 才打 AI，把自然語言轉成 tag 條件。
    setLoading(true);
    setHint(null);
    try {
      const parsed = await parsePrompt(q);
      if (
        parsed.tags.length === 0 &&
        parsed.soft_tags.length === 0 &&
        !parsed.open_at &&
        parsed.distance_km === null
      ) {
        setHint(`找不到「${q}」相關咖啡廳，也沒抓到對應條件，請試試「有插座」「適合讀書」「不限時」等關鍵字`);
      } else {
        setHint(parsed.rationale || null);
      }
      setLastSubmittedQuery(q);
      onSubmit(
        parsed.tags,
        parsed.soft_tags,
        parsed.open_at,
        parsed.distance_km ?? (radiusM != null ? radiusM / 1000 : null),
        null,
      );
    } catch (e) {
      setHint("搜尋失敗,請稍後再試");
      onSubmit([], [], null, radiusM != null ? radiusM / 1000 : null, null);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    onQueryChange("");
    setLastSubmittedQuery("");
    setHint(null);
    onClear?.();
  };

  // 「清除」只出現在「已對某個關鍵字按過搜尋」的回放狀態 — 純選 tag / 沒輸入時，
  // 都該顯示「搜尋」讓使用者直接送出。
  const isClearButton = query.trim() !== "" && query === lastSubmittedQuery;

  return (
    <section>
      {!compact && (
        <h2 className="text-3xl font-bold leading-tight sm:text-4xl">
          現在想要⋯
        </h2>
      )}
      {compact && (
        <h2 className="text-lg font-semibold tracking-tight">我現在想要⋯</h2>
      )}

      {!compact && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {PROMPT_TAGS.map((t) => {
            if (t.key === "late_night") {
              return (
                <TagChip
                  key={t.key}
                  selected={isLateNightActive}
                  accent={t.accent && !isLateNightActive}
                  onClick={() => onOpenAtChange?.(isLateNightActive ? null : lateNightTarget)}
                  noShadow
                >
                  {isLateNightActive ? t.label : `＋ ${t.label}`}
                </TagChip>
              );
            }
            if (t.key === "near_3km") {
              return (
                <TagChip
                  key={t.key}
                  selected={isNear3kmActive}
                  accent={t.accent && !isNear3kmActive}
                  onClick={() => {
                    if (!location) {
                      requestLocation();
                    }
                    onRadiusMChange?.(isNear3kmActive ? null : 3000);
                  }}
                  noShadow
                >
                  {isNear3kmActive ? t.label : `＋ ${t.label}`}
                </TagChip>
              );
            }
            return (
              <TagChip
                key={t.key}
                selected={selected.has(t.key)}
                accent={t.accent && !selected.has(t.key)}
                onClick={() => onToggle(t.key)}
                noShadow
              >
                {selected.has(t.key) ? t.label : `＋ ${t.label}`}
              </TagChip>
            );
          })}
        </div>
      )}

      <div className="sticky top-0 z-30 -mx-5 bg-base-100 px-5 pt-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!isClearButton) {
            void handleSubmit();
          }
          inputRef.current?.blur();
        }}
        className="join w-full border border-base-content/25"
      >
        <label
          className="input input-ghost join-item flex-1 flex items-center gap-2 pl-3 focus-within:bg-transparent shadow-none focus-within:shadow-none"
          style={{ boxShadow: "none" }}
        >
          <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={1.5} className="text-base-content/55 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={handleInputFocus}
            placeholder="輸入咖啡廳名字或是情境"
            className="grow focus:outline-none bg-transparent text-sm h-full"
            disabled={loading}
          />
        </label>
        <button
          type={isClearButton ? "button" : "submit"}
          onClick={isClearButton ? handleClear : undefined}
          className="btn btn-neutral join-item"
          disabled={loading}
        >
          {loading ? (
            <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" />
          ) : (
            isClearButton ? "清除" : "搜尋"
          )}
        </button>
      </form>
      </div>
      {hint && (
        <p className="mt-2 text-xs text-base-content/55 leading-snug">{hint}</p>
      )}

      {showInlineResults && inlineResults.length > 0 && (
        <ul className="mt-2 divide-y divide-base-content/10 border border-base-content/15 bg-base-100">
          {inlineResults.map((c) => {
            const status = c.business_hours
              ? isCafeOpenAt(c.business_hours, new Date())
              : { open_now: c.open_now, opens_at: c.opens_at ?? null, closes_at: c.closes_at ?? null };
            const statusColor = status.open_now
              ? "text-success"
              : status.opens_at
                ? "text-warning"
                : "text-error";
            const statusText = status.open_now
              ? status.closes_at
                ? `營業至 ${status.closes_at}`
                : "營業中"
              : status.opens_at
                ? `${status.opens_at} 開店`
                : "已休息";
            return (
              <li key={c.id}>
                <Link
                  to={{ pathname: `/cafe/${c.slug ?? c.id}`, search: routerLocation.search }}
                  className="block px-3 py-2.5 hover:bg-base-200"
                >
                  <div className="truncate text-[15px] font-semibold">
                    {c.name}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[12px] text-base-content/55">
                    {c.google_rating != null && (
                      <>
                        <span className="flex items-center gap-0.5">
                          <HugeiconsIcon icon={StarIcon} size={11} className="text-warning fill-warning" />
                          <span className="font-medium">{c.google_rating.toFixed(1)}</span>
                        </span>
                        <span className="text-base-content/30">·</span>
                      </>
                    )}
                    <span>{formatDistance(c.distance_km)}</span>
                    <span className="text-base-content/30">·</span>
                    <span className={`truncate font-medium ${statusColor}`}>{statusText}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {compact && (
      <div className="mt-3 flex flex-wrap gap-1.5">
        {PROMPT_TAGS.map((t) => {
          // 「22:00 後」不是真的 tag，而是時間篩選 — 直接驅動 openAt。
          if (t.key === "late_night") {
            return (
              <TagChip
                key={t.key}
                selected={isLateNightActive}
                accent={t.accent && !isLateNightActive}
                onClick={() => onOpenAtChange?.(isLateNightActive ? null : lateNightTarget)}
                noShadow
              >
                {isLateNightActive ? t.label : `＋ ${t.label}`}
              </TagChip>
            );
          }
          if (t.key === "near_3km") {
            return (
              <TagChip
                key={t.key}
                selected={isNear3kmActive}
                accent={t.accent && !isNear3kmActive}
                onClick={() => {
                  if (!location) {
                    requestLocation();
                  }
                  onRadiusMChange?.(isNear3kmActive ? null : 3000);
                }}
                noShadow
              >
                {isNear3kmActive ? t.label : `＋ ${t.label}`}
              </TagChip>
            );
          }
          return (
            <TagChip
              key={t.key}
              selected={selected.has(t.key)}
              accent={t.accent && !selected.has(t.key)}
              onClick={() => onToggle(t.key)}
              noShadow
            >
              {selected.has(t.key) ? t.label : `＋ ${t.label}`}
            </TagChip>
          );
        })}
      </div>
      )}
    </section>
  );
}

export { PROMPT_TAGS };
