'use client';
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api, AppNotification } from '@/lib/api';
import { useAuth } from './AuthContext';

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  refresh: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  refresh: async () => {},
  markRead: async () => {},
  markAllRead: async () => {},
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const canReceive = isAuthenticated && user && ['administrator', 'supervisor'].includes(user.role);

  const refresh = useCallback(async () => {
    if (!canReceive) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await api.notifications.getAll() as any;
      setNotifications(res.data ?? []);
      setUnreadCount(res.unreadCount ?? 0);
    } catch {
      // network error — silently ignore, will retry on next poll
    }
  }, [canReceive]);

  useEffect(() => {
    if (!canReceive) return;
    refresh();
    intervalRef.current = setInterval(refresh, 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [canReceive, refresh]);

  const markRead = useCallback(async (id: number) => {
    await api.notifications.markRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await api.notifications.markAllRead();
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, refresh, markRead, markAllRead }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
