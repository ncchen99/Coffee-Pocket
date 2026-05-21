import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { TagChip } from "@/components/primitives";
import { parsePrompt } from "@/lib/api";

const PROMPT_TAGS: { key: string; label: string; accent?: boolean }[] = [
  { key: "no_limit", label: "不限時" },
  { key: "socket", label: "有插座" },
  { key: "quiet", label: "安靜" },
  { key: "late_night", label: "22:00 後" },
  { key: "near_3km", label: "3km 內" },
  { key: "group_4", label: "4 人" },
];

interface PromptHeroProps {
  query: string;
  onQueryChange: (v: string) => void;
  selected: Set<string>;
  onToggle: (key: string) => void;
  /** 提交時呼叫，會收到 LLM 解析出的 frontend short keys 和相對時間點。 */
  onSubmit: (parsedTags: string[], openAt: string | null) => void;
  compact?: boolean;
}

/** 對話式 hero — 桌面 (compact) / 手機共用。 */
export function PromptHero({
  query,
  onQueryChange,
  selected,
  onToggle,
  onSubmit,
  compact = false,
}: PromptHeroProps) {
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const handleSubmit = async () => {
    const q = query.trim();
    if (!q) {
      onSubmit([], null);
      return;
    }
    setLoading(true);
    setHint(null);
    try {
      const parsed = await parsePrompt(q);
      if (parsed.tags.length === 0 && !parsed.open_at) {
        setHint("沒抓到對應條件,請試試「有插座」「安靜」「不限時」等關鍵字");
      } else {
        setHint(parsed.rationale || null);
      }
      onSubmit(parsed.tags, parsed.open_at);
    } catch (e) {
      setHint("語意分析失敗,改用手動篩選試試");
      onSubmit([], null);
    } finally {
      setLoading(false);
    }
  };

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
          void handleSubmit();
        }}
        className="join mt-4 w-full border border-base-content/25"
      >
        <span className="join-item flex items-center pl-3 text-base-content/55">
          <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={1.5} />
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="例如:想找一個安靜可以帶電腦的地方"
          className="input input-ghost join-item flex-1 focus:outline-none focus:bg-transparent"
          disabled={loading}
        />
        <button type="submit" className="btn btn-neutral join-item" disabled={loading}>
          {loading ? (
            <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" />
          ) : (
            "搜尋"
          )}
        </button>
      </form>
      {hint && (
        <p className="mt-2 text-xs text-base-content/55 leading-snug">{hint}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {PROMPT_TAGS.map((t) => (
          <TagChip
            key={t.key}
            selected={selected.has(t.key)}
            accent={t.accent && !selected.has(t.key)}
            onClick={() => onToggle(t.key)}
          >
            {selected.has(t.key) ? t.label : `＋ ${t.label}`}
          </TagChip>
        ))}
      </div>
    </section>
  );
}

export { PROMPT_TAGS };
