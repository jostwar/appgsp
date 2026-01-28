import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loginWoo, refreshWooSession, registerPushToken } from '../api/backend';
import { registerForPushNotificationsAsync } from '../utils/notifications';

const AuthContext = createContext(null);
const AUTH_STORAGE_KEY = 'gsp_auth';
const REMEMBER_STORAGE_KEY = 'gsp_auth_remember';
const PUSH_TOKEN_KEY = 'gsp_push_token';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [sessionEmail, setSessionEmail] = useState(null);
  const [sessionPassword, setSessionPassword] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const remember = await AsyncStorage.getItem(REMEMBER_STORAGE_KEY);
        if (remember !== 'true') return;
        const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        if (!stored) return;
        const parsed = JSON.parse(stored);
        const storedUser = parsed?.user || null;
        const storedToken = parsed?.token || null;
        setUser(storedUser);
        setToken(storedToken);
        setSessionEmail(storedUser?.email || null);
        if (storedToken && !storedUser?.cedula) {
          try {
            const refreshed = await refreshWooSession({ token: storedToken });
            const nextUser = refreshed?.user || null;
            const nextToken = refreshed?.token || storedToken;
            if (nextUser) {
              setUser(nextUser);
              setToken(nextToken);
              await AsyncStorage.setItem(
                AUTH_STORAGE_KEY,
                JSON.stringify({ user: nextUser, token: nextToken })
              );
            }
          } catch (_error) {
            // ignore refresh errors
          }
        }
      } catch (_error) {
        // ignore restore errors
      }
    };

    restoreSession();
  }, []);

  useEffect(() => {
    let isMounted = true;
    const syncPushToken = async () => {
      if (!user?.cedula) return;
      try {
        const token = await registerForPushNotificationsAsync();
        if (!token || !isMounted) return;
        const storedToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
        if (storedToken === token) return;
        await registerPushToken({
          token,
          cedula: user?.cedula,
          email: user?.email,
          platform: Platform.OS,
        });
        await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
      } catch (_error) {
        // ignore push registration errors
      }
    };
    syncPushToken();
    return () => {
      isMounted = false;
    };
  }, [user?.cedula, user?.email]);

  const signIn = async ({ email, password, remember }) => {
    setLoading(true);
    try {
      const data = await loginWoo({ email, password });
      setUser(data?.user || null);
      setToken(data?.token || null);
      setSessionEmail(email || data?.user?.email || null);
      setSessionPassword(password || null);
      if (remember) {
        await AsyncStorage.setItem(
          AUTH_STORAGE_KEY,
          JSON.stringify({ user: data?.user || null, token: data?.token || null })
        );
        await AsyncStorage.setItem(REMEMBER_STORAGE_KEY, 'true');
      } else {
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
    try {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      await AsyncStorage.setItem(REMEMBER_STORAGE_KEY, 'false');
    } catch (_error) {
      // ignore sign out errors
    }
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
    }),
    [user, token, sessionEmail, sessionPassword, loading]
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
