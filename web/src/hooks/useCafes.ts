import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  searchCafes,
  fetchCafeDetail,
  searchCafesCount,
  fetchAllCafesForSearch,
  type SearchParams,
} from "@/lib/api";
import { indexCafes, type IndexedCafe, type RawCafe } from "@/lib/cafeFilter";

const ALL_CAFES_CACHE_KEY = "cp:all_cafes:v1";
const ALL_CAFES_CACHE_TTL_MS = 1000 * 60 * 30; // 30 min

function readLocalCorpusCache(): RawCafe[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ALL_CAFES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt: number; data: RawCafe[] };
    if (!parsed || typeof parsed.savedAt !== "number" || !Array.isArray(parsed.data)) return null;
    if (Date.now() - parsed.savedAt > ALL_CAFES_CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeLocalCorpusCache(data: RawCafe[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      ALL_CAFES_CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), data }),
    );
  } catch {
    // 配額滿就略過，不影響搜尋功能
  }
}

/**
 * 取得全量咖啡廳資料 + 預先索引化（normalize 後的字串）給本地搜尋用。
 * 首次載入直接讀 localStorage 當 initialData → 列表零延遲渲染，
 * TanStack Query 在背景重抓最新一份。
 */
export function useAllCafes(): {
  data: IndexedCafe[];
  isLoading: boolean;
  isError: boolean;
} {
  const initialData = useMemo(() => readLocalCorpusCache() ?? undefined, []);

  const query = useQuery({
    queryKey: ["cafes", "all-for-search"],
    queryFn: async () => {
      const rows = await fetchAllCafesForSearch();
      writeLocalCorpusCache(rows);
      return rows;
    },
    staleTime: ALL_CAFES_CACHE_TTL_MS,
    initialData,
    // initialData 來自 localStorage，可能已存在一段時間 — 讓 query 主動 refetch
    initialDataUpdatedAt: 0,
  });

  const indexed = useMemo(
    () => (query.data ? indexCafes(query.data) : []),
    [query.data],
  );

  return {
    data: indexed,
    isLoading: query.isLoading && indexed.length === 0,
    isError: query.isError,
  };
}

export function useCafeSearch(params: SearchParams) {
  return useQuery({
    queryKey: ["cafes", "search", params],
    queryFn: () => searchCafes(params),
    staleTime: 60_000,
  });
}

export function useCafeDetail(id: string | null | undefined) {
  return useQuery({
    queryKey: ["cafe", id],
    queryFn: () => fetchCafeDetail(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCafeSearchCount(params: {
  tags?: string[];
  tags_or?: string[];
  lng?: number | null;
  lat?: number | null;
  radius_m?: number;
  open_at?: string | null;
  q?: string | null;
}) {
  return useQuery({
    queryKey: ["cafes", "count", params],
    queryFn: () => searchCafesCount(params),
    staleTime: 30_000,
  });
}
