import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";

export function useUserVotesForCafe(cafeId: string | null) {
  return useQuery({
    queryKey: ["user-votes", cafeId],
    queryFn: () => api.fetchUserVotes(cafeId!),
    enabled: !!cafeId,
  });
}

export function useVoteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { cafeId: string; tagKey: string; vote: 1 | -1 }) =>
      api.voteTag(vars.cafeId, vars.tagKey, vars.vote),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["cafe", vars.cafeId] });
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
      qc.invalidateQueries({ queryKey: ["cafe", vars.cafeId] });
      qc.invalidateQueries({ queryKey: ["user-votes", vars.cafeId] });
    },
  });
}
