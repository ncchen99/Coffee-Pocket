import { useEffect, useState, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, hasSupabaseConfig } from "@/lib/supabase";

export interface AuthState {
  user: User | null;
  loading: boolean;
}

const ensuredUsers = new Set<string>();

async function ensureUserProfile(user: User) {
  if (ensuredUsers.has(user.id)) return;
  ensuredUsers.add(user.id);

  try {
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Failed to check user profile in public.users:", error);
      ensuredUsers.delete(user.id);
      return;
    }

    if (!data) {
      const displayName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split("@")[0] ||
        "User";
      const avatarUrl =
        user.user_metadata?.avatar_url ||
        user.user_metadata?.picture ||
        null;

      const { error: insertError } = await supabase
        .from("users")
        .insert({
          id: user.id,
          display_name: displayName,
          avatar_url: avatarUrl,
        });

      if (insertError) {
        console.error("Failed to insert missing user profile:", insertError);
        ensuredUsers.delete(user.id);
      } else {
        console.log("Successfully created user profile in public.users");
      }
    }
  } catch (err) {
    console.error("Unexpected error ensuring user profile:", err);
    ensuredUsers.delete(user.id);
  }
}

/** Supabase Auth hook — Google OAuth only. */
export function useAuth() {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    if (!hasSupabaseConfig) {
      setState({ user: null, loading: false });
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user ?? null;
      setState({ user, loading: false });
      if (user) {
        ensureUserProfile(user);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setState({ user, loading: false });
      if (user) {
        ensureUserProfile(user);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!hasSupabaseConfig) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  }, []);

  const signOut = useCallback(async () => {
    if (!hasSupabaseConfig) return;
    await supabase.auth.signOut();
  }, []);

  return { ...state, signInWithGoogle, signOut };
}
