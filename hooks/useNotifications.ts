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
    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) { setLoading(false); return; }

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(60);

      if (error) throw error;
      if (data) {
        setNotifications(data as AppNotification[]);
        setUnreadCount(data.filter((n) => !n.read).length);
      }
    } catch (e) {
      console.error('[useNotifications] refetch failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  // Realtime — okamžitá aktualizácia, filtrovaná podľa user_id
  useEffect(() => {
    let userId = '';
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      userId = user.id;
      const channel = supabase
        .channel(`notifications-rt-${instanceId.current}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          () => refetch()
        )
        .subscribe();
      // Cleanup uložíme do refu
      instanceId.current = channel.topic;
    });
    return () => {
      if (userId) {
        supabase.getChannels().forEach(ch => {
          if (ch.topic === instanceId.current) supabase.removeChannel(ch);
        });
      }
    };
  }, [refetch]);

  async function markRead(id: string): Promise<void> {
    try {
      const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
      if (error) throw error;
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (e) {
      console.error('[useNotifications] markRead failed:', e);
      await refetch(); // Obnov skutočný stav
    }
  }

  async function markAllRead(): Promise<void> {
    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) return;
      const { error } = await supabase.from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false);
      if (error) throw error;
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (e) {
      console.error('[useNotifications] markAllRead failed:', e);
      await refetch();
    }
  }

  return { notifications, loading, unreadCount, refetch, markRead, markAllRead };
}
