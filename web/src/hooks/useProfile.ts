import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import type { UserPreferences } from "@/types/cafe";

export function useUserStats(userId: string | null) {
  return useQuery({
    queryKey: ["user-stats", userId],
    queryFn: () => api.fetchUserStats(userId!),
    enabled: !!userId,
  });
}

export function useContributions(userId: string | null, limit?: number) {
  return useQuery({
    queryKey: ["contributions", userId, limit],
    queryFn: () => api.fetchContributions(userId!, limit),
    enabled: !!userId,
  });
}

export function useUserPreferences(userId: string | null) {
  return useQuery({
    queryKey: ["user-preferences", userId],
    queryFn: () => api.fetchUserPreferences(userId!),
    enabled: !!userId,
  });
}

export function useUpdateUserPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { userId: string; prefs: Partial<UserPreferences> }) =>
      api.updateUserPreferences(vars.userId, vars.prefs),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["user-preferences", vars.userId] });
    },
  });
}
