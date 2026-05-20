import { useCallback, useState } from "react";

/** 集中管理「搜尋條件 + 自然語言 query」狀態的小 hook。 */
export function useSearchSelection(initial?: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initial ?? []));
  const [query, setQuery] = useState("");

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const setAll = useCallback((keys: string[]) => {
    setSelected(new Set(keys));
  }, []);

  return { selected, toggle, setAll, query, setQuery };
}
