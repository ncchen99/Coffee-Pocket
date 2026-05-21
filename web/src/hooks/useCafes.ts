import { useQuery } from "@tanstack/react-query";
import {
  searchCafes,
  fetchCafeDetail,
  searchCafesCount,
  type SearchParams,
} from "@/lib/api";

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
  lng?: number | null;
  lat?: number | null;
  radius_m?: number;
  open_at?: string | null;
}) {
  return useQuery({
    queryKey: ["cafes", "count", params],
    queryFn: () => searchCafesCount(params),
    staleTime: 30_000,
  });
}
