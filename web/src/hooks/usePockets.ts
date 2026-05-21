import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";

export function useSubmitReport() {
  return useMutation({
    mutationFn: api.submitReport,
  });
}

export function usePockets() {
  return useQuery({
    queryKey: ["pockets"],
    queryFn: api.fetchPockets,
  });
}

export function usePocketItems(pocketId: string | null) {
  return useQuery({
    queryKey: ["pocket-items", pocketId],
    queryFn: () => api.fetchPocketItems(pocketId!),
    enabled: !!pocketId,
  });
}

export function useCreatePocket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createPocket,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pockets"] }),
  });
}

export function useUpdatePocket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      id: string;
      patch: Parameters<typeof api.updatePocket>[1];
    }) => api.updatePocket(vars.id, vars.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pockets"] }),
  });
}

export function useDeletePocket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deletePocket,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pockets"] });
      qc.invalidateQueries({ queryKey: ["pocket-items"] });
    },
  });
}

export function useAddToPocket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { pocketId: string; cafeId: string; note?: string }) =>
      api.addToPocket(vars.pocketId, vars.cafeId, vars.note),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["pockets"] });
      qc.invalidateQueries({ queryKey: ["pocket-items", vars.pocketId] });
      qc.invalidateQueries({ queryKey: ["cafe-in-pocket", vars.cafeId] });
    },
  });
}

export function useRemoveFromPocket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { pocketId: string; cafeId: string }) =>
      api.removeFromPocket(vars.pocketId, vars.cafeId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["pockets"] });
      qc.invalidateQueries({ queryKey: ["pocket-items", vars.pocketId] });
      qc.invalidateQueries({ queryKey: ["cafe-in-pocket", vars.cafeId] });
    },
  });
}

export function useIsCafeInPocket(cafeId: string | null) {
  return useQuery({
    queryKey: ["cafe-in-pocket", cafeId],
    queryFn: () => api.isCafeInAnyPocket(cafeId!),
    enabled: !!cafeId,
  });
}
