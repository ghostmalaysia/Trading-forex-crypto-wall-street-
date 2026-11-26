// Copy to web/supabase-config.js and fill with your Supabase project values.
// The publishable/anon key is safe for browser use only with Auth and the RLS migration applied.
// Never put a service_role/secret key in this file or in frontend code.
window.SUPABASE_CONFIG = {
  url: "https://YOUR_PROJECT.supabase.co",
  anonKey: "YOUR_SUPABASE_ANON_KEY",
  memoryEnabled: true,
};
