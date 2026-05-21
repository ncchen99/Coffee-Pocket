import { useCallback, useState } from "react";

/** 集中管理「搜尋條件 + 自然語言 query + 場景」狀態的小 hook。 */
export function useSearchSelection(initial?: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initial ?? []));
  const [query, setQuery] = useState("");
  /** 目前選中的快速場景 (work / late / group / discover);手動改 chip 後清掉。 */
  const [scenario, setScenario] = useState<string | null>(null);

  const toggle = useCallback((key: string) => {
    // 任何手動 chip 互動都視為脫離場景模式。
    setScenario(null);
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const setAll = useCallback((keys: string[]) => {
    setScenario(null);
    setSelected(new Set(keys));
  }, []);

  const pickScenario = useCallback((s: { key: string; tags: string[] }) => {
    setScenario(s.key);
    setSelected(new Set(s.tags));
  }, []);

  return { selected, toggle, setAll, query, setQuery, scenario, pickScenario };
}
