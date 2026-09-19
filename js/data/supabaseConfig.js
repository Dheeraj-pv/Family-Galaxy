// Your Supabase project's public client config, from
// Supabase dashboard -> Project Settings -> Data API (or "API") -> Project URL, and
// Project Settings -> API Keys -> the "anon" / "public" key (never the "service_role" one —
// that key bypasses every policy in supabase/schema.sql and must never appear in client code).
//
// Both values are meant to be public in client-side code (Supabase's own docs say so) — the
// real security boundary is the Row Level Security policies in supabase/schema.sql, not secrecy
// here. `hasSupabaseConfig()` lets the rest of the app fall back gracefully (localStorage-only,
// no cloud sync, no photo upload) until this is filled in, rather than crashing on load.

export const supabaseConfig = {
  url: 'https://bxfnhcsctadcldlcnhkb.supabase.co', // trimmed of the /rest/v1/ suffix — the SDK adds its own path
  anonKey: 'sb_publishable_uUk6H71H943AKqnDiNziVw_gPpStqN8',
};

export function hasSupabaseConfig() {
  return Boolean(supabaseConfig.url && supabaseConfig.anonKey);
}
