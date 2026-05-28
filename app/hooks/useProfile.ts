import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { getCache, setCache, CACHE_KEYS } from '../utils/offlineCache';

type Profile = { id: string; role: string; full_name: string | null; phone_number: string | null; avatar_url: string | null };

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hasHealthPassport, setHasHealthPassport] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }

      // Skus nacitat z cache pre okamzity render
      if (tick === 0) {
        const cached = await getCache<{ profile: Profile; hasPassport: boolean }>(CACHE_KEYS.profile(user.id));
        if (cached && !cancelled) {
          setProfile(cached.profile);
          setHasHealthPassport(cached.hasPassport);
          setLoading(false);
        }
      }

      // Fetch profile + health passport paralelne
      const [profileRes, passportRes] = await Promise.all([
        supabase.from('profiles')
          .select('id, role, full_name, phone_number, avatar_url')
          .eq('id', user.id)
          .maybeSingle(),
        supabase.from('health_passports')
          .select('patient_id')
          .eq('patient_id', user.id)
          .maybeSingle(),
      ]);

      const profileData = profileRes.data;
      const passportData = passportRes.data;

      if (!cancelled) {
        setProfile(profileData);
        setHasHealthPassport(!!passportData);
        setLoading(false);
        if (profileData) {
          setCache(CACHE_KEYS.profile(user.id), { profile: profileData, hasPassport: !!passportData });
        }
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [tick]);

  return { profile, hasHealthPassport, loading, refetch };
}
