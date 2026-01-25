import { createContext, useContext, useMemo, useState } from 'react';
import { loginWoo } from '../api/backend';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(false);

  const signIn = async ({ email, password }) => {
    setLoading(true);
    try {
      const data = await loginWoo({ email, password });
      setUser(data?.user || null);
      setToken(data?.token || null);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || 'No se pudo iniciar sesión' };
    } finally {
      setLoading(false);
    }
  };

  const signOut = () => {
    setUser(null);
    setToken(null);
  };

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      signIn,
      signOut,
    }),
    [user, token, loading]
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
