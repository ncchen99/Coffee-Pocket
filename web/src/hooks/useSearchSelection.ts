import { useCallback, useState, useEffect } from "react";
import { getTWTimeParts } from "@/lib/format";

const WEEKDAY_TO_DATE_STR: Record<string, string> = {
  monday: "2026-05-18",
  tuesday: "2026-05-19",
  wednesday: "2026-05-20",
  thursday: "2026-05-21",
  friday: "2026-05-22",
  saturday: "2026-05-23",
  sunday: "2026-05-24",
};

/** 集中管理「搜尋條件 + 自然語言 query + 場景 + 時間 + 距離」狀態的小 hook。 */
export function useSearchSelection(initial?: string[], initialRadiusM?: number | null) {
  const initialSet = new Set(initial ?? []);

  // 根據初始 tags 來決定時間篩選與距離篩選
  let initialOpenAt: string | null = null;
  if (initialSet.has("late_night")) {
    const parts = getTWTimeParts(new Date());
    const dateStr = WEEKDAY_TO_DATE_STR[parts.weekday] || "2026-05-21";
    initialOpenAt = `${dateStr}T22:00:00+08:00`;
  }

  let initialRadius = initialRadiusM ?? null;
  if (initialSet.has("near_3km") && !initialRadius) {
    initialRadius = 3000;
  }

  const [selected, setSelected] = useState<Set<string>>(initialSet);
  /** OR-match 條件；由 pickScenario 或語意搜尋的 soft_tags 設定；任何手動互動都會清空。 */
  const [orSelected, setOrSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  /** 目前選中的快速場景 (work / late / group / discover);手動改 chip 後清掉。 */
  const [scenario, setScenario] = useState<string | null>(null);
  /** 指定時間篩選 (ISO-8601 格式，null 表示不限時間) */
  const [openAt, setOpenAt] = useState<string | null>(initialOpenAt);
  /** 指定距離篩選 (公尺，null 表示預設 5000) */
  const [radiusM, setRadiusM] = useState<number | null>(initialRadius);

  // 當手動點擊標籤時，如果是時間或距離這類特殊虛擬標籤，需同步對應的 filter 欄位
  const toggle = useCallback((key: string) => {
    // 任何手動 chip 互動都視為脫離場景模式。
    setScenario(null);
    setOrSelected([]);

    if (key === "late_night") {
      if (selected.has("late_night")) {
        setOpenAt(null);
      } else {
        const parts = getTWTimeParts(new Date());
        const dateStr = WEEKDAY_TO_DATE_STR[parts.weekday] || "2026-05-21";
        setOpenAt(`${dateStr}T22:00:00+08:00`);
      }
    } else if (key === "near_3km") {
      if (selected.has("near_3km")) {
        setRadiusM(null);
      } else {
        setRadiusM(3000);
      }
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
      });
    }
  }, [selected]);

  const setAll = useCallback((keys: string[]) => {
    setScenario(null);
    setOrSelected([]);
    setSelected(new Set(keys));
  }, []);

  const pickScenario = useCallback(
    (s: { key: string; tags: string[]; tagsOr?: string[]; resolveOpenAt?: () => string | null }) => {
      setScenario(s.key);
      setSelected(new Set(s.tags));
      setOrSelected(s.tagsOr ?? []);
      setOpenAt(s.resolveOpenAt ? s.resolveOpenAt() : null);
    },
    [],
  );
  // 雙向同步：當時間 (openAt) 或距離 (radiusM) 從外部被改變（如進階篩選面板）時，同步更新 selected tags
  useEffect(() => {
    setSelected((prev) => {
      let changed = false;
      const next = new Set(prev);

      // 同步 22:00 後 (late_night)
      const isLateNightTime = openAt && (() => {
        try {
          const parts = getTWTimeParts(new Date(openAt));
          return parts.hour >= 22;
        } catch {
          return false;
        }
      })();

      if (isLateNightTime) {
        if (!next.has("late_night")) {
          next.add("late_night");
          changed = true;
        }
      } else {
        if (next.has("late_night")) {
          next.delete("late_night");
          changed = true;
        }
      }

      // 同步 3km 內 (near_3km)
      const is3km = radiusM === 3000;
      if (is3km) {
        if (!next.has("near_3km")) {
          next.add("near_3km");
          changed = true;
        }
      } else {
        if (next.has("near_3km")) {
          next.delete("near_3km");
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [openAt, radiusM]);

  return {
    selected,
    orSelected,
    toggle,
    setAll,
    setOrSelected,
    query,
    setQuery,
    scenario,
    pickScenario,
    openAt,
    setOpenAt,
    radiusM,
    setRadiusM,
  };
}
