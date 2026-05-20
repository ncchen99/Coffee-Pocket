import { HugeiconsIcon } from "@hugeicons/react";
import { ThumbsUpIcon, ThumbsDownIcon } from "@hugeicons/core-free-icons";
import type { TagWithConfidence } from "@/types/cafe";

interface TagConfidenceRowProps {
  tag: TagWithConfidence;
  onVote?: (key: TagWithConfidence["key"], vote: "up" | "down") => void;
}

/** 單一 platform tag 的信心 + 投票列。 */
export function TagConfidenceRow({ tag, onVote }: TagConfidenceRowProps) {
  const pct = Math.round(tag.confidence * 100);
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{tag.label}</div>
        <div className="mt-1 flex items-center gap-2">
          <progress
            className="progress progress-neutral w-28 h-1"
            value={pct}
            max={100}
          />
          <span className="font-mono text-[10px] text-base-content/55">
            {pct}% · {tag.evidence_count} 則證據
          </span>
        </div>
      </div>
      <div className="join">
        <button
          type="button"
          aria-label="同意"
          onClick={() => onVote?.(tag.key, "up")}
          className="btn btn-xs btn-outline join-item"
        >
          <HugeiconsIcon icon={ThumbsUpIcon} size={12} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          aria-label="不同意"
          onClick={() => onVote?.(tag.key, "down")}
          className="btn btn-xs btn-outline join-item"
        >
          <HugeiconsIcon icon={ThumbsDownIcon} size={12} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
