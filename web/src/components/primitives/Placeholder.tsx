import clsx from "@/lib/clsx";

interface PlaceholderProps {
  label?: string;
  className?: string;
  ratio?: "square" | "4/3" | "16/9" | "21/9";
}

/** 圖片占位 — 用 daisyUI `skeleton` 樣式,在資料未到位時顯示。 */
export function Placeholder({ label, className, ratio = "4/3" }: PlaceholderProps) {
  const aspect = {
    square: "aspect-square",
    "4/3": "aspect-[4/3]",
    "16/9": "aspect-video",
    "21/9": "aspect-[21/9]",
  }[ratio];
  return (
    <div
      className={clsx(
        "skeleton flex items-center justify-center bg-base-200 font-mono text-[10px] text-base-content/40",
        aspect,
        className,
      )}
      aria-hidden
    >
      {label}
    </div>
  );
}
