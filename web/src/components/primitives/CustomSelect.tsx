import { useState, useRef, useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";

export interface SelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  widthClass?: string;
}

/**
 * 客製化下拉選單 — 遵循系統直角強制設計語意 (rounded-none)。
 */
export function CustomSelect({ options, value, onChange, widthClass = "w-36" }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value) ?? options[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`relative inline-block text-left ${widthClass}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between border border-base-content/15 bg-base-100 px-3 py-1.5 text-sm transition-colors hover:bg-base-200/50 focus:outline-none rounded-none"
      >
        <span className="truncate">{selectedOption?.label}</span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={14}
          strokeWidth={1.5}
          className={`text-base-content/65 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <ul className="absolute right-0 z-50 mt-1 w-full border border-base-content/15 bg-base-100 py-1 shadow-md focus:outline-none rounded-none cp-anim-slide-in">
          {options.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center px-3 py-1.5 text-left text-sm transition-colors hover:bg-base-200/60 rounded-none ${
                  opt.value === value ? "bg-base-200 font-semibold text-base-content" : "text-base-content/85"
                }`}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
