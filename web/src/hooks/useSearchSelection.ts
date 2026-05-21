import { useCallback, useState } from "react";

/** 集中管理「搜尋條件 + 自然語言 query + 場景 + 時間」狀態的小 hook。 */
export function useSearchSelection(initial?: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initial ?? []));
  /** OR-match 條件，只由 pickScenario 設定；任何手動互動都會清空。 */
  const [orSelected, setOrSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  /** 目前選中的快速場景 (work / late / group / discover);手動改 chip 後清掉。 */
  const [scenario, setScenario] = useState<string | null>(null);
  /** 指定時間篩選 (ISO-8601 格式，null 表示不限時間) */
  const [openAt, setOpenAt] = useState<string | null>(null);

  const toggle = useCallback((key: string) => {
    // 任何手動 chip 互動都視為脫離場景模式。
    setScenario(null);
    setOrSelected([]);
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

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

  return {
    selected,
    orSelected,
    toggle,
    setAll,
    query,
    setQuery,
    scenario,
    pickScenario,
    openAt,
    setOpenAt,
  };
}
