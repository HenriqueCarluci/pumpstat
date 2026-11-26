// Chave publicável do Supabase: pode ficar no front, o acesso é controlado por RLS.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://jujbkgzkenktjuurrwvo.supabase.co';
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_8_e3UpVPrgDdQbNlFitBvw_9uSoJG_t';
// Serviço no Render que entra no piugame.com pelo usuário.
export const API_URL = import.meta.env.VITE_API_URL || 'https://pumpstat-api.onrender.com';
