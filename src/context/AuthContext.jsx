import { createContext, useCallback, useEffect, useState } from 'react';
import {
  clearInMemoryTokens,
  registerSessionExpiredHandler,
  setInMemoryTokens,
} from '../services/apiClient';
import { authService } from '../services/authService';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [bootstrapStatus, setBootstrapStatus] = useState({
    superAdminClaimed: true,
    requiresPasscode: false,
    loaded: false,
  });

  const refreshBootstrapStatus = useCallback(async () => {
    try {
      const status = await authService.getBootstrapStatus();
      setBootstrapStatus({ ...status, loaded: true });
    } catch {
      setBootstrapStatus((prev) => ({ ...prev, loaded: true }));
    }
  }, []);

  useEffect(() => {
    refreshBootstrapStatus();
    registerSessionExpiredHandler(() => {
      setUser(null);
    });
  }, [refreshBootstrapStatus]);

  const applySession = (sessionData) => {
    setInMemoryTokens(sessionData.accessToken, sessionData.refreshToken);
    setUser(sessionData.user);
    return sessionData.user;
  };

  const login = async (credentials) => {
    const data = await authService.login(credentials);
    return applySession(data);
  };

  const register = async (payload) => {
    const data = await authService.register(payload);
    return applySession(data);
  };

  const claimSuperAdmin = async (payload) => {
    const data = await authService.claimSuperAdmin(payload);
    setBootstrapStatus((prev) => ({ ...prev, superAdminClaimed: true }));
    return applySession(data);
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch {
      // Clear local session regardless of network failure
    } finally {
      clearInMemoryTokens();
      setUser(null);
    }
  };

  const updateUserLocal = (patch) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        bootstrapStatus,
        refreshBootstrapStatus,
        login,
        register,
        claimSuperAdmin,
        logout,
        updateUserLocal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
