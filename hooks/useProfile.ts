import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

export function useProfile() {
  type Profile = { id: string; role: string; full_name: string | null; phone_number: string | null };
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hasHealthPassport, setHasHealthPassport] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }

      // Fetch profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      // Check health passport
      const { data: passportData } = await supabase
        .from('health_passports')
        .select('patient_id')
        .eq('patient_id', user.id)
        .maybeSingle();

      if (!cancelled) {
        setProfile(profileData);
        setHasHealthPassport(!!passportData);
        setLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { profile, hasHealthPassport, loading, refetch };
}
