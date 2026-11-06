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
  archived: AppNotification[];
  loadArchived: () => Promise<void>;
  archive: (id: number) => Promise<void>;
  restore: (id: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  refresh: async () => {},
  markRead: async () => {},
  markAllRead: async () => {},
  archived: [],
  loadArchived: async () => {},
  archive: async () => {},
  restore: async () => {},
  remove: async () => {},
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [archived, setArchived] = useState<AppNotification[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Every signed-in user has a bell; customers get updates on their own orders
  const canReceive = isAuthenticated && !!user;

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

  const loadArchived = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await api.notifications.getAll(50, true) as any;
      setArchived(res.data ?? []);
    } catch {
      // keep whatever was shown before
    }
  }, []);

  const archive = useCallback(async (id: number) => {
    await api.notifications.archive(id);
    const n = notifications.find(x => x.id === id);
    setNotifications(prev => prev.filter(x => x.id !== id));
    if (n && !n.isRead) setUnreadCount(prev => Math.max(0, prev - 1));
    if (n) setArchived(prev => [{ ...n, isRead: true, isArchived: true }, ...prev]);
  }, [notifications]);

  const restore = useCallback(async (id: number) => {
    await api.notifications.archive(id, false);
    setArchived(prev => prev.filter(x => x.id !== id));
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (id: number) => {
    await api.notifications.delete(id);
    const n = notifications.find(x => x.id === id);
    setNotifications(prev => prev.filter(x => x.id !== id));
    setArchived(prev => prev.filter(x => x.id !== id));
    if (n && !n.isRead) setUnreadCount(prev => Math.max(0, prev - 1));
  }, [notifications]);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, refresh, markRead, markAllRead, archived, loadArchived, archive, restore, remove }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
