'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { api, User, setAuthToken, getAuthToken, PERMISSIONS_STALE_EVENT } from '@/lib/api';
import { userCan } from '@/lib/permissions';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<{ token: string; user: User } | undefined>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  /** True if the signed-in user has at least one of these permissions */
  can: (...permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = async () => {
    const token = getAuthToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await api.auth.me();
      if (response.data) {
        setUser(response.data);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setAuthToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  // Keep the menus in step with permission changes an administrator makes while
  // this user is signed in: reload them quietly (no loading state) when the tab
  // regains focus, once a minute, and right after the server refuses a request.
  const signedIn = !!user;
  const lastRefresh = useRef(0);
  useEffect(() => {
    if (!signedIn) return;
    const refresh = () => {
      if (Date.now() - lastRefresh.current < 5000 || !getAuthToken()) return;
      lastRefresh.current = Date.now();
      // Keep the same object when nothing changed, so pages whose effects depend
      // on `user` or `can` don't reload their data every minute
      api.auth.me().then(r => {
        const fresh = r.data;
        if (fresh) setUser(prev => (JSON.stringify(prev) === JSON.stringify(fresh) ? prev : fresh));
      }).catch(() => {});
    };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener(PERMISSIONS_STALE_EVENT, refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(refresh, 60000);
    return () => {
      window.removeEventListener(PERMISSIONS_STALE_EVENT, refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [signedIn]);

  const login = async (username: string, password: string) => {
    const response = await api.auth.login(username, password);
    if (response.data) {
      setAuthToken(response.data.token);
      setUser(response.data.user);
      return response.data;
    }
  };

  // Stable between renders so pages can list it in effect dependencies
  const can = useCallback(
    (...permissions: string[]) => userCan(user?.permissions, ...permissions),
    [user]);

  const logout = async () => {
    try {
      await api.auth.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setAuthToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        checkAuth,
        can,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Role check for the few things that really are about the kind of account
// (customer self-service pages). Features use can() permissions instead.
export function hasAccess(userRole: string | undefined, allowedRoles: string[]): boolean {
  if (!userRole) return false;
  return allowedRoles.includes(userRole);
}
