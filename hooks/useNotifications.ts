import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabase';

export type AppNotification = {
  id: string;
  title: string;
  body: string | null;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  appointment_id: string | null;
  created_at: string;
};

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading]             = useState(true);
  const [unreadCount, setUnreadCount]     = useState(0);
  const instanceId = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const refetch = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(60);

    if (data) {
      setNotifications(data as AppNotification[]);
      setUnreadCount(data.filter((n) => !n.read).length);
    }
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  // Realtime — okamžitá aktualizácia bez refreshu
  useEffect(() => {
    const channel = supabase
      .channel(`notifications-rt-${instanceId.current}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' },
        () => refetch()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  async function markRead(id: string) {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  async function markAllRead() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  return { notifications, loading, unreadCount, refetch, markRead, markAllRead };
}
