import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl     = process.env.EXPO_PUBLIC_SUPABASE_URL     ?? 'https://fcxkgnfnfswcusjetqop.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjeGtnbmZuZnN3Y3VzamV0cW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMjIyNDIsImV4cCI6MjA5MDY5ODI0Mn0.GrfXZ38qWjOCnpaAXMqoyiygK2hGMf4qKkZreKFIgs4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage:           AsyncStorage,
    autoRefreshToken:  true,
    persistSession:    true,
    detectSessionInUrl: false,
  },
});
