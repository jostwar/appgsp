import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loginWoo } from '../api/backend';

const AuthContext = createContext(null);
const AUTH_STORAGE_KEY = 'gsp_auth';
const REMEMBER_STORAGE_KEY = 'gsp_auth_remember';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [sessionEmail, setSessionEmail] = useState(null);
  const [sessionPassword, setSessionPassword] = useState(null);
  const [loading, setLoading] = useState(false);
  const [rememberSession, setRememberSession] = useState(false);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const remember = await AsyncStorage.getItem(REMEMBER_STORAGE_KEY);
        if (remember !== 'true') return;
        setRememberSession(true);
        const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        if (!stored) return;
        const parsed = JSON.parse(stored);
        setUser(parsed?.user || null);
        setToken(parsed?.token || null);
        setSessionEmail(parsed?.user?.email || null);
      } catch (_error) {
        // ignore restore errors
      }
    };

    restoreSession();
  }, []);

  const signIn = async ({ email, password, remember }) => {
    setLoading(true);
    try {
      const data = await loginWoo({ email, password });
      setUser(data?.user || null);
      setToken(data?.token || null);
      setSessionEmail(email || data?.user?.email || null);
      setSessionPassword(password || null);
      if (remember) {
        setRememberSession(true);
        await AsyncStorage.setItem(
          AUTH_STORAGE_KEY,
          JSON.stringify({ user: data?.user || null, token: data?.token || null })
        );
        await AsyncStorage.setItem(REMEMBER_STORAGE_KEY, 'true');
      } else {
        setRememberSession(false);
        await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
        await AsyncStorage.setItem(REMEMBER_STORAGE_KEY, 'false');
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || 'No se pudo iniciar sesión' };
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setUser(null);
    setToken(null);
    setSessionEmail(null);
    setSessionPassword(null);
    setRememberSession(false);
    try {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      await AsyncStorage.setItem(REMEMBER_STORAGE_KEY, 'false');
    } catch (_error) {
      // ignore sign out errors
    }
  };

  const updateUser = async (nextUser = {}) => {
    setUser((prev) => {
      const merged = { ...(prev || {}), ...(nextUser || {}) };
      if (rememberSession) {
        AsyncStorage.setItem(
          AUTH_STORAGE_KEY,
          JSON.stringify({ user: merged, token })
        ).catch(() => null);
      }
      return merged;
    });
  };

  const value = useMemo(
    () => ({
      user,
      token,
      sessionEmail,
      sessionPassword,
      loading,
      signIn,
      signOut,
      updateUser,
    }),
    [user, token, sessionEmail, sessionPassword, loading, rememberSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
}
