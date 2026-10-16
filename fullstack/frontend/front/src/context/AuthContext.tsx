'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api, User, setAuthToken, getAuthToken } from '@/lib/api';
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
