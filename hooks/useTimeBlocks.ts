import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

export type BlockType = 'lunch' | 'meeting' | 'vacation' | 'personal' | 'other';

export type TimeBlock = {
  id: string;
  doctor_id: string;
  title: string;
  block_type: BlockType;
  start_time: string;
  end_time: string;
  note: string | null;
  created_at: string;
};

export const BLOCK_CONFIG: Record<BlockType, { label: string; icon: string; color: string; bg: string; border: string }> = {
  lunch:    { label: 'Obed',      icon: '🍽️', color: '#7D3C0A', bg: '#FEF0E7', border: '#F5CBA7' },
  meeting:  { label: 'Schôdzka',  icon: '📋', color: '#1A5276', bg: '#EBF5FB', border: '#AED6F1' },
  vacation: { label: 'Dovolenka', icon: '🏖️', color: '#0E6655', bg: '#E8F8F5', border: '#A2D9CE' },
  personal: { label: 'Osobné',    icon: '👤', color: '#6C3483', bg: '#F5EEF8', border: '#D2B4DE' },
  other:    { label: 'Iné',       icon: '⏸️', color: '#566573', bg: '#F2F3F4', border: '#CCD1D1' },
};

export function useTimeBlocks(doctorId: string | null) {
  const [blocks,  setBlocks]  = useState<TimeBlock[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!doctorId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('time_blocks')
      .select('id, doctor_id, title, block_type, start_time, end_time, note, created_at')
      .eq('doctor_id', doctorId)
      .gte('end_time', new Date().toISOString())
      .order('start_time', { ascending: true });
    setBlocks((data as TimeBlock[]) ?? []);
    setLoading(false);
  }, [doctorId]);

  useEffect(() => { refetch(); }, [refetch]);

  async function addBlock(block: {
    title: string;
    block_type: BlockType;
    start_time: string;
    end_time: string;
    note?: string;
  }) {
    if (!doctorId) return new Error('Nie si prihlásený');
    const { error } = await supabase.from('time_blocks').insert({
      ...block, doctor_id: doctorId,
    });
    if (!error) await refetch();
    return error;
  }

  async function deleteBlock(id: string) {
    const { error } = await supabase.from('time_blocks').delete().eq('id', id);
    if (!error) await refetch();
    return error;
  }

  return { blocks, loading, refetch, addBlock, deleteBlock };
}

/** Vráti bloky pre konkrétny deň ako { start, end } v minútach od polnoci */
export async function fetchBlockedMinutes(
  doctorId: string,
  dayStart: Date,
  dayEnd: Date,
): Promise<Array<{ start: number; end: number }>> {
  const { data } = await supabase
    .from('time_blocks')
    .select('start_time, end_time')
    .eq('doctor_id', doctorId)
    .lte('start_time', dayEnd.toISOString())
    .gte('end_time', dayStart.toISOString());

  return (data ?? []).map((b: { start_time: string; end_time: string }) => {
    const s = new Date(b.start_time);
    const e = new Date(b.end_time);
    // Orezaj na hranice dňa (blok môže presahovať viaceré dni)
    const sMin = Math.max(0, s.getHours() * 60 + s.getMinutes());
    const eMin = Math.min(24 * 60, e.getHours() * 60 + e.getMinutes());
    return { start: sMin, end: eMin };
  });
}
