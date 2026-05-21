import { useCallback, useState } from "react";

/** 集中管理「搜尋條件 + 自然語言 query + 場景 + 時間 + 距離 + 關鍵字」狀態的小 hook。 */
export function useSearchSelection(initial?: string[], initialRadiusM?: number | null, initialKeyword?: string | null) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initial ?? []));
  /** OR-match 條件；由 pickScenario 或語意搜尋的 soft_tags 設定；任何手動互動都會清空。 */
  const [orSelected, setOrSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  /** 目前選中的快速場景 (work / late / group / discover);手動改 chip 後清掉。 */
  const [scenario, setScenario] = useState<string | null>(null);
  /** 指定時間篩選 (ISO-8601 格式，null 表示不限時間) */
  const [openAt, setOpenAt] = useState<string | null>(null);
  /** 指定距離篩選 (公尺，null 表示預設 5000) */
  const [radiusM, setRadiusM] = useState<number | null>(initialRadiusM ?? null);
  /** 關鍵字搜尋（店名 / 地址）。null 或空字串表示未啟用。 */
  const [keyword, setKeyword] = useState<string | null>(initialKeyword ?? null);

  const toggle = useCallback((key: string) => {
    // 任何手動 chip 互動都視為脫離場景模式，並清掉關鍵字（避免雙重過濾）。
    setScenario(null);
    setOrSelected([]);
    setKeyword(null);
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const setAll = useCallback((keys: string[]) => {
    setScenario(null);
    setOrSelected([]);
    setKeyword(null);
    setSelected(new Set(keys));
  }, []);

  const pickScenario = useCallback(
    (s: { key: string; tags: string[]; tagsOr?: string[]; resolveOpenAt?: () => string | null }) => {
      setScenario(s.key);
      setSelected(new Set(s.tags));
      setOrSelected(s.tagsOr ?? []);
      setOpenAt(s.resolveOpenAt ? s.resolveOpenAt() : null);
      setKeyword(null);
    },
    [],
  );

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
    keyword,
    setKeyword,
  };
}
