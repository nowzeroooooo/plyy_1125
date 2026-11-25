import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const supabaseConfigError = Boolean(url) !== Boolean(publishableKey)
  ? "Supabase 설정이 일부만 입력되었습니다. URL과 Publishable Key를 모두 설정하거나 모두 비워 주세요."
  : null;
export const isDemoMode = !url && !publishableKey;
export const supabase = url && publishableKey
  ? createClient(url, publishableKey, {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    })
  : null;
