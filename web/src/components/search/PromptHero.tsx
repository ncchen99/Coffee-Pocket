import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { TagChip } from "@/components/primitives";
import { smartSearch } from "@/lib/api";
import { TAG_LABEL_TO_KEY } from "@/data/filterTags";

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
  { key: "group_4", label: "4 人" },
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
  /** 目前的時間篩選；與「22:00 後」chip 雙向綁定。 */
  openAt?: string | null;
  onOpenAtChange?: (val: string | null) => void;
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
  resetHintTrigger,
}: PromptHeroProps) {
  const lateNightTarget = todayAt22();
  const isLateNightActive = openAt === lateNightTarget;
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [lastSubmittedQuery, setLastSubmittedQuery] = useState("");

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
      setLastSubmittedQuery("");
      onSubmit([], [], null, null, null);
      return;
    }

    // 1. 完全命中標籤 label（如「有插座」「適合讀書」）→ 套用標籤，無需後端。
    const labelKey = matchTagLabelKey(q);
    if (labelKey) {
      setHint(`已套用標籤「${q}」`);
      setLastSubmittedQuery(q);
      onSubmit([labelKey], [], null, null, null);
      return;
    }

    setLoading(true);
    setHint(null);
    try {
      // 2 + 3. 一個 edge function 同時做關鍵字 count 與 LLM 解析的分流，
      //         免去客戶端「先 count 再 parse」兩個 round-trip。
      const { matched_count, parsed } = await smartSearch(q);
      if (matched_count > 0) {
        setHint(`找到 ${matched_count} 間店名 / 地址含「${q}」`);
        setLastSubmittedQuery(q);
        onSubmit([], [], null, null, q);
        return;
      }

      if (
        !parsed ||
        (parsed.tags.length === 0 &&
          parsed.soft_tags.length === 0 &&
          !parsed.open_at &&
          parsed.distance_km === null)
      ) {
        setHint(`找不到「${q}」相關咖啡廳，也沒抓到對應條件，請試試「有插座」「適合讀書」「不限時」等關鍵字`);
      } else {
        setHint(parsed.rationale || null);
      }
      setLastSubmittedQuery(q);
      onSubmit(
        parsed?.tags ?? [],
        parsed?.soft_tags ?? [],
        parsed?.open_at ?? null,
        parsed?.distance_km ?? null,
        null,
      );
    } catch (e) {
      setHint("搜尋失敗,請稍後再試");
      onSubmit([], [], null, null, null);
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

  const hasActiveFilters = query.trim() !== "" || selected.size > 0;
  const isClearButton = hasActiveFilters && query === lastSubmittedQuery;

  return (
    <section>
      {!compact && (
        <>
          <h2 className="text-3xl font-bold leading-tight sm:text-4xl">
            現在想要⋯
          </h2>
          <p className="mt-2 text-sm text-base-content/60">
            告訴我情境,我幫你挑
          </p>
        </>
      )}
      {compact && (
        <h2 className="text-lg font-semibold tracking-tight">我現在想要⋯</h2>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!isClearButton) {
            void handleSubmit();
          }
        }}
        className="join mt-4 w-full border border-base-content/25"
      >
        <label className="input input-ghost join-item flex-1 flex items-center gap-2 pl-3 focus-within:bg-transparent">
          <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={1.5} className="text-base-content/55 flex-shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
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
      {hint && (
        <p className="mt-2 text-xs text-base-content/55 leading-snug">{hint}</p>
      )}

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
              >
                {isLateNightActive ? t.label : `＋ ${t.label}`}
              </TagChip>
            );
          }
          return (
            <TagChip
              key={t.key}
              selected={selected.has(t.key)}
              accent={t.accent && !selected.has(t.key)}
              onClick={() => onToggle(t.key)}
            >
              {selected.has(t.key) ? t.label : `＋ ${t.label}`}
            </TagChip>
          );
        })}
      </div>
    </section>
  );
}

export { PROMPT_TAGS };
