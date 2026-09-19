// Lazily creates the Supabase client (Postgres tables for shared postcards/moments/photo-URL
// records, Storage buckets for the photos themselves) from the config in supabaseConfig.js.
// Loaded as a plain ES module from jsDelivr's "+esm" build — no npm install, no build step,
// same as every other module here.
//
// Every consumer goes through getSupabase() rather than importing the SDK directly, so there is
// exactly one place that knows the CDN URL/version and exactly one client instance.
// hasSupabaseConfig() lets callers check first and skip cloud sync entirely (falling back to
// localStorage-only, as before) when the project hasn't been set up yet.

import { supabaseConfig, hasSupabaseConfig } from './supabaseConfig.js';

const SDK_VERSION = '2.116.0';
const SDK_URL = `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${SDK_VERSION}/+esm`;

let clientPromise = null;

export function getSupabase() {
  if (!hasSupabaseConfig()) return null;
  if (!clientPromise) {
    clientPromise = import(SDK_URL).then(({ createClient }) =>
      createClient(supabaseConfig.url, supabaseConfig.anonKey));
  }
  return clientPromise;
}

export { hasSupabaseConfig };
