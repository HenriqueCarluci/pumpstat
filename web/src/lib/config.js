// Chave publicável do Supabase: pode ficar no front, o acesso é controlado por RLS.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://jujbkgzkenktjuurrwvo.supabase.co';
// Subdomínio próprio do Supabase: com ele ativo, o login (auth) só funciona por ele. Até lá o app cai no endereço padrão.
export const SUPABASE_AUTH_URL = import.meta.env.VITE_SUPABASE_AUTH_URL || 'https://piustats.supabase.co';
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_8_e3UpVPrgDdQbNlFitBvw_9uSoJG_t';
// Serviço no Render que entra no piugame.com pelo usuário.
export const API_URL = import.meta.env.VITE_API_URL || 'https://pumpstat-api.onrender.com';
// Endereço público do site (o app nativo roda em localhost, então links e QR codes usam este).
export const SITE_URL = import.meta.env.VITE_SITE_URL || 'https://piustats.com.br';
// Esquema do app Android/iOS para abrir um link direto no app (ex.: QR da fila).
export const APP_SCHEME = 'com.henriquecarluci.stepclub';
