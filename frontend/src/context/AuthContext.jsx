import { createContext, useContext, useEffect, useMemo, useState } from "react";

const AuthContext = createContext(null);

const REFRESH_SAFETY_WINDOW_SECONDS = 90;

function shouldRefreshSession(session) {
  if (!session?.expires_at) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return session.expires_at - nowSeconds <= REFRESH_SAFETY_WINDOW_SECONDS;
}

export function AuthProvider({ supabase, children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) console.error("getSession failed", error);
      setSession(data?.session ?? null);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) {
        setSession(nextSession);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [supabase]);

  const value = useMemo(() => {
    async function refreshAccessToken() {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        console.warn("refreshSession failed", error);
        return null;
      }
      setSession(data?.session ?? null);
      return data?.session?.access_token ?? null;
    }

    return {
      session,
      loading,
      async signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setSession(data?.session ?? null);
        return data;
      },
      async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        setSession(null);
      },
      async accessToken() {
        const { data } = await supabase.auth.getSession();
        const currentSession = data?.session ?? null;
        if (!currentSession) return null;
        if (shouldRefreshSession(currentSession)) {
          const refreshed = await refreshAccessToken();
          if (refreshed) return refreshed;
        }
        return currentSession.access_token ?? null;
      },
      refreshAccessToken
    };
  }, [session, loading, supabase]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
