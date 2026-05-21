interface StarRatingProps {
  value: number;
  max?: number;
  size?: number;
  className?: string;
}

function StarPath({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      className={filled ? "text-warning" : "text-base-content/25"}
    >
      <path
        d="M12 2.5l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.6l-5.9 3.08 1.13-6.58L2.45 9.44l6.6-.96L12 2.5z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 顯示 0–max 的星星評分，支援實心、半實心、空心。 */
export function StarRating({ value, max = 5, size = 14, className = "" }: StarRatingProps) {
  const clamped = Math.max(0, Math.min(max, value));
  const widthPct = (clamped / max) * 100;

  return (
    <span
      className={`relative inline-flex ${className}`}
      style={{ width: size * max, height: size }}
      aria-label={`${value.toFixed(1)} / ${max}`}
    >
      <span className="absolute inset-0 flex">
        {Array.from({ length: max }).map((_, i) => (
          <StarPath key={i} filled={false} size={size} />
        ))}
      </span>
      <span
        className="absolute inset-y-0 left-0 flex overflow-hidden"
        style={{ width: `${widthPct}%` }}
      >
        <span className="flex shrink-0">
          {Array.from({ length: max }).map((_, i) => (
            <StarPath key={i} filled={true} size={size} />
          ))}
        </span>
      </span>
    </span>
  );
}
