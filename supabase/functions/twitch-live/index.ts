// Lives da Twitch: quem preencheu a Twitch no perfil e entrou ao vivo vira notificação para os amigos.
// Chamada pelo pg_cron a cada 30 min. Precisa dos segredos TWITCH_CLIENT_ID e TWITCH_CLIENT_SECRET
// (app criado em dev.twitch.tv). Sem eles, não faz nada.
import { createClient } from 'jsr:@supabase/supabase-js@2';

let token: { value: string; exp: number } | null = null;

async function appToken(id: string, secret: string) {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const r = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: 'client_credentials' }),
  });
  if (!r.ok) throw new Error(`token ${r.status}`);
  const j = await r.json();
  token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return token.value;
}

Deno.serve(async () => {
  const id = Deno.env.get('TWITCH_CLIENT_ID'), secret = Deno.env.get('TWITCH_CLIENT_SECRET');
  if (!id || !secret) return Response.json({ configured: false });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: due } = await db.rpc('twitch_check_due');
  if (due === false) return Response.json({ skipped: true });
  const { data: users, error } = await db.rpc('twitch_logins');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const list = (users ?? []) as { user: string; login: string }[];
  const byLogin = new Map(list.filter((u) => /^[a-z0-9_]{3,25}$/.test(u.login)).map((u) => [u.login, u.user]));
  const lives: unknown[] = [];
  let err: string | null = null;
  try {
    const tk = await appToken(id, secret);
    const logins = [...byLogin.keys()];
    for (let i = 0; i < logins.length; i += 100) {
      const q = logins.slice(i, i + 100).map((l) => `user_login=${encodeURIComponent(l)}`).join('&');
      const r = await fetch(`https://api.twitch.tv/helix/streams?first=100&${q}`, { headers: { 'Client-Id': id, Authorization: `Bearer ${tk}` } });
      if (r.status === 401) token = null;
      if (!r.ok) throw new Error(`streams ${r.status}`);
      const j = await r.json();
      for (const s of j.data ?? []) {
        const user = byLogin.get(String(s.user_login).toLowerCase());
        if (user && s.type === 'live') lives.push({ user, login: s.user_login, id: s.id, title: s.title, game: s.game_name, started_at: s.started_at });
      }
    }
  } catch (e) {
    err = String((e as Error).message || e);
  }
  // com erro, não encerra as lives em andamento: só registra o erro
  if (err) {
    await db.from('twitch_check').upsert({ id: 1, ran_at: new Date().toISOString(), error: err });
    return Response.json({ error: err }, { status: 502 });
  }
  const { data, error: e2 } = await db.rpc('twitch_live_report', { p_lives: lives, p_checked: byLogin.size, p_error: null });
  if (e2) return Response.json({ error: e2.message }, { status: 500 });
  return Response.json({ checked: byLogin.size, live: lives.length, ...data });
});
