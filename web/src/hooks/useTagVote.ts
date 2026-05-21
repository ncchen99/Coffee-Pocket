import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";

export function useUserVotesForCafe(cafeId: string | null) {
  return useQuery({
    queryKey: ["user-votes", cafeId],
    queryFn: () => api.fetchUserVotes(cafeId!),
    enabled: !!cafeId,
  });
}

// cafe detail 的 queryKey 是 ["cafe", slug],但 mutation 拿到的是 UUID;
// 兩者不會相等,所以用前綴 ["cafe"] 一次失效所有 cafe detail。
export function useVoteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { cafeId: string; tagKey: string; vote: 1 | -1 }) =>
      api.voteTag(vars.cafeId, vars.tagKey, vars.vote),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["cafe"] });
      qc.invalidateQueries({ queryKey: ["user-votes", vars.cafeId] });
    },
  });
}

export function useClearVote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { cafeId: string; tagKey: string }) =>
      api.clearVote(vars.cafeId, vars.tagKey),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["cafe"] });
      qc.invalidateQueries({ queryKey: ["user-votes", vars.cafeId] });
    },
  });
}

export function useAddCafeTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { cafeId: string; tagKey: string }) =>
      api.addCafeTag(vars.cafeId, vars.tagKey),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["cafe"] });
      qc.invalidateQueries({ queryKey: ["user-votes", vars.cafeId] });
    },
  });
}

export function useDeleteCafeTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { cafeId: string; tagKey: string }) =>
      api.deleteCafeTag(vars.cafeId, vars.tagKey),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["cafe"] });
      qc.invalidateQueries({ queryKey: ["user-votes", vars.cafeId] });
    },
  });
}

