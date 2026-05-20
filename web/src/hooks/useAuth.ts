import { useEffect, useState, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, hasSupabaseConfig } from "@/lib/supabase";

export interface AuthState {
  user: User | null;
  loading: boolean;
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
      setState({ user: data.session?.user ?? null, loading: false });
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ user: session?.user ?? null, loading: false });
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
