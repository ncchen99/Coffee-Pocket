import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { TagChip } from "@/components/primitives";

export interface ChipOption {
  key: string;
  label: string;
}

interface FilterChipBarProps {
  options: ChipOption[];
  selected: Set<string>;
  onToggle: (key: string) => void;
  onAdd?: () => void;
  resultCount?: number;
  sortLabel?: string;
  className?: string;
  hasShadow?: boolean;
  noShadow?: boolean;
}

/** 篩選 chip 條 — 桌面 / 手機共用。底層用 daisyUI btn (TagChip)。 */
export function FilterChipBar({
  options,
  selected,
  onToggle,
  onAdd,
  resultCount,
  sortLabel,
  className,
  hasShadow,
  noShadow,
}: FilterChipBarProps) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <div className="flex flex-1 items-center gap-1.5 overflow-x-auto no-scrollbar">
        {options.map((o) => {
          const isSel = selected.has(o.key);
          return (
            <TagChip
              key={o.key}
              selected={isSel}
              onClick={() => onToggle(o.key)}
              hasShadow={hasShadow}
              noShadow={noShadow}
            >
              {o.label}
              {isSel && (
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  size={12}
                  strokeWidth={1.5}
                  className="ml-0.5 opacity-70"
                />
              )}
            </TagChip>
          );
        })}
        {onAdd && (
          <button type="button" onClick={onAdd} className="btn btn-xs btn-ghost gap-1 font-normal">
            <HugeiconsIcon icon={PlusSignIcon} size={12} strokeWidth={1.5} />
            標籤
          </button>
        )}
      </div>
      {(resultCount !== undefined || sortLabel) && (
        <div className="hidden sm:flex flex-none items-center gap-3 text-xs text-base-content/55">
          {resultCount !== undefined && <span>{resultCount} 間符合</span>}
          {sortLabel && <span>排序:{sortLabel} ↓</span>}
        </div>
      )}
    </div>
  );
}
