// Administração → Monitoramento: saúde da plataforma (API, banco, sincronizações, tarefas agendadas, ArcadeStat),
// uso, consultas mais pesadas, erros do app e o diagnóstico deste aparelho.
import { useCallback, useEffect, useState } from 'react';
import { useData } from '../App.jsx';
import { rpc } from '../lib/api.js';
import { API_URL, SITE_URL } from '../lib/config.js';
import { BUILD, platform } from '../lib/errors.js';
import { canAdmin } from '../lib/admin.js';
import { fmtNum, locale, t, tErr } from '../lib/i18n.js';
import { timeAgo } from '../components/ui.jsx';
import { Check, Copy, RefreshCw, Trash2 } from '../components/Icons.jsx';

const MB = 1024 * 1024;
const fmtBytes = (b) => (b >= MB ? `${(b / MB).toFixed(1)} MB` : `${Math.round((b || 0) / 1024)} KB`);
const hoursSince = (iso) => (iso ? (Date.now() - Date.parse(iso)) / 3600000 : Infinity);
// nível de cada indicador: ok / atenção / problema
const lvl = (v, warn, bad, higherIsWorse = true) => (v == null ? 'unk' : higherIsWorse ? (v >= bad ? 'bad' : v >= warn ? 'warn' : 'ok') : (v <= bad ? 'bad' : v <= warn ? 'warn' : 'ok'));
const LV_LABEL = { ok: 'OK', warn: 'Atenção', bad: 'Problema', unk: 'Sem dado' };

async function timed(fn) {
  const t0 = performance.now();
  try { const r = await fn(); return { ms: Math.round(performance.now() - t0), ok: true, r }; } catch (e) { return { ms: Math.round(performance.now() - t0), ok: false, err: e.message }; }
}

export default function AdminHealth() {
  const { plan } = useData();
  const [h, setH] = useState(null);
  const [probe, setProbe] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const [at, setAt] = useState(null);

  const load = useCallback(async () => {
    setBusy(true); setErr('');
    const [db, api] = await Promise.all([
      timed(() => rpc('admin_health')),
      timed(() => fetch(`${API_URL}/health`, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })),
    ]);
    if (db.ok) setH(db.r); else setErr(tErr(db.err));
    setProbe({ db: db.ms, dbOk: db.ok, api: api.ms, apiOk: api.ok, apiErr: api.err });
    setAt(new Date()); setBusy(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!auto) return undefined; const i = setInterval(() => { if (!document.hidden) load(); }, 30000); return () => clearInterval(i); }, [auto, load]);

  const u = h?.usage || {};
  const failsJobs = (h?.jobs || []).reduce((s, j) => s + Number(j.fails_24h || 0), 0);
  const status = h && probe ? [
    { k: 'API (Render)', v: probe.apiOk ? `${probe.api} ms` : t('fora do ar'), l: probe.apiOk ? lvl(probe.api, 1500, 6000) : 'bad', hint: t('Acorda em até ~50 s quando estava dormindo') },
    { k: t('Banco (Supabase)'), v: probe.dbOk ? `${probe.db} ms` : t('erro'), l: probe.dbOk ? lvl(probe.db, 800, 3000) : 'bad', hint: t('Tempo do painel inteiro, ida e volta') },
    { k: t('Última sincronização'), v: u.last_sync ? timeAgo(u.last_sync) : '—', l: lvl(hoursSince(u.last_sync), 12, 48), hint: t('De qualquer jogador') },
    { k: 'ArcadeStat', v: h.arcadestat?.at ? timeAgo(h.arcadestat.at) : '—', l: lvl(hoursSince(h.arcadestat?.at), 48, 24 * 7), hint: h.arcadestat ? t('{m} de {n} charts casados', { m: fmtNum(h.arcadestat.matched), n: fmtNum(h.arcadestat.rows) }) : '' },
    { k: t('Tarefas agendadas'), v: h.jobs ? tnFails(failsJobs) : '—', l: h.jobs ? lvl(failsJobs, 1, 3) : 'unk', hint: t('Falhas nas últimas 24 h') },
    { k: t('Erros do app'), v: fmtNum(h.errors?.count_24h || 0), l: lvl(h.errors?.count_24h || 0, 5, 30), hint: t('{n} pessoas nas últimas 24 h', { n: h.errors?.users_24h || 0 }) },
    { k: t('Cache do banco'), v: h.db?.cache_hit != null ? `${h.db.cache_hit}%` : '—', l: lvl(Number(h.db?.cache_hit), 99, 95, false), hint: t('Abaixo de 99% o banco lê mais do disco') },
    { k: t('Conexões'), v: `${connTotal(h.db?.connections)} / ${h.db?.max_connections || '?'}`, l: lvl(connTotal(h.db?.connections) / (h.db?.max_connections || 60), 0.6, 0.85), hint: t('Abertas agora') },
  ] : [];
  const worst = status.some((s) => s.l === 'bad') ? 'bad' : status.some((s) => s.l === 'warn') ? 'warn' : 'ok';

  return (
    <div className="admin-health">
      <div className="ah-bar">
        <span className={`ah-dot ${worst}`} /> <b>{h ? t(worst === 'ok' ? 'Tudo funcionando' : worst === 'warn' ? 'Alguns pontos de atenção' : 'Há problemas') : t('Carregando…')}</b>
        {at && <span className="muted small">{t('atualizado às {h}', { h: at.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' }) })}</span>}
        <label className="small ic-row ah-auto"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> {t('Atualizar a cada 30 s')}</label>
        <button className="btn ghost sm" onClick={load} disabled={busy}><RefreshCw size={14} className={busy ? 'spin' : ''} /> {t('Atualizar')}</button>
      </div>
      {err && <div className="form-err">{err}</div>}

      <div className="ah-status">
        {status.map((s) => (
          <div key={s.k} className={`ah-stat ${s.l}`} title={s.hint}>
            <small>{s.k}</small><b>{s.v}</b><span>{t(LV_LABEL[s.l])}{s.hint ? ` · ${s.hint}` : ''}</span>
          </div>
        ))}
      </div>

      {h && <>
        <div className="ah-grid">
          <section className="card">
            <h3>{t('Uso')}</h3>
            <div className="ah-kpis">
              <K l={t('Contas')} v={u.users} s={t('+{n} em 7 dias', { n: u.new_7d || 0 })} />
              <K l={t('Online agora')} v={u.online_now} />
              <K l={t('Sincronizaram 24 h')} v={u.active_24h} s={t('{n} em 7 dias', { n: u.active_7d || 0 })} />
              <K l={t('Sincronizações 24 h')} v={u.syncs_24h} />
              <K l={t('Jogadas novas 24 h')} v={u.plays_24h} />
              <K l={t('Na fila agora')} v={u.queue_now} />
            </div>
            <h4 className="cfg-sub">{t('Sincronizações por hora (24 h)')}</h4>
            <HourBars rows={u.syncs_by_hour || []} />
            <p className="muted tiny">{t('Origem nos últimos 7 dias')}: {Object.entries(u.sources_7d || {}).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}
              {' · '}{t('charts não reconhecidos')}: {fmtNum(u.unmatched_7d || 0)}</p>
          </section>

          <section className="card">
            <h3>{t('Banco de dados')}</h3>
            <div className="ah-kpis">
              <K l={t('Tamanho')} v={fmtBytes(h.db.size)} s={t('limite do plano grátis: 500 MB')} />
              <K l={t('Cache')} v={`${h.db.cache_hit ?? '—'}%`} s={`${t('índices')} ${h.db.index_hit ?? '—'}%`} />
              <K l={t('Conexões')} v={connTotal(h.db.connections)} s={Object.entries(h.db.connections || {}).map(([k, v]) => `${k} ${v}`).join(' · ')} />
            </div>
            <div className="ah-meter"><span style={{ width: `${Math.min(100, (h.db.size / (500 * MB)) * 100)}%` }} /></div>
            <table className="mstats">
              <thead><tr><th>{t('Tabela')}</th><th>{t('Linhas')}</th><th>{t('Tamanho')}</th><th>{t('Mortas')}</th></tr></thead>
              <tbody>{(h.db.tables || []).map((r) => (
                <tr key={r.name} className={r.dead > Math.max(200, r.rows * 0.2) ? 'warn' : ''}><td>{r.name}</td><td>{fmtNum(r.rows)}</td><td>{fmtBytes(r.bytes)}</td><td>{fmtNum(r.dead)}</td></tr>
              ))}</tbody>
            </table>
          </section>
        </div>

        <section className="card">
          <h3>{t('Funções mais pesadas')}</h3>
          <p className="muted tiny">{t('Desde o último reinício do banco. Tempo médio acima de 150 ms em função muito chamada é candidato a otimização.')}</p>
          {h.db.statements ? (
            <table className="mstats">
              <thead><tr><th>{t('Função')}</th><th>{t('Chamadas')}</th><th>{t('Média')}</th><th>{t('Total')}</th></tr></thead>
              <tbody>{h.db.statements.map((s, i) => (
                <tr key={i} className={s.mean_ms > 150 && s.calls > 50 ? 'warn' : ''}>
                  <td className="ah-q" title={s.q}>{/^select wal->>/i.test(s.q) ? t('Realtime (assinaturas)') : s.q}</td>
                  <td>{fmtNum(s.calls)}</td><td>{s.mean_ms} ms</td><td>{s.total_s} s</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <p className="muted small">{t('Estatísticas de consultas indisponíveis.')}</p>}
        </section>

        <div className="ah-grid">
          <section className="card">
            <h3>{t('Tarefas agendadas')}</h3>
            {!h.jobs?.length && <p className="muted small">{t('Nenhuma tarefa agendada no banco.')}</p>}
            {(h.jobs || []).map((j) => (
              <div key={j.name} className="ah-job">
                <span className={`ah-dot ${!j.active ? 'unk' : j.fails_24h > 0 || j.last?.status === 'failed' ? 'bad' : 'ok'}`} />
                <div><b>{j.name}</b><small className="muted"> {j.schedule}{j.active ? '' : ` · ${t('desligada')}`}</small>
                  <div className="muted tiny">{j.last ? `${t('última')}: ${timeAgo(j.last.start)} · ${j.last.status} · ${j.last.ms} ms` : t('ainda não rodou')}
                    {j.fails_24h > 0 && ` · ${t('{n} falhas em 24 h', { n: j.fails_24h })}`}</div></div>
              </div>
            ))}
            <div className="ah-job">
              <span className={`ah-dot ${lvl(hoursSince(h.arcadestat?.at), 48, 24 * 7) }`} />
              <div><b>ArcadeStat</b><small className="muted"> {t('tiers e tags')}</small>
                <div className="muted tiny">{h.arcadestat ? `${t('última')}: ${timeAgo(h.arcadestat.at)} · ${fmtNum(h.arcadestat.matched)}/${fmtNum(h.arcadestat.rows)} · ${t('sem par')}: ${h.arcadestat.unmatched ?? 0}` : t('ainda não rodou')}</div></div>
            </div>
          </section>
          <Device />
        </div>

        <ClientErrors errors={h.errors} canClear={canAdmin(plan, 'config')} onCleared={load} />
      </>}
    </div>
  );
}

const connTotal = (c) => Object.values(c || {}).reduce((s, n) => s + Number(n || 0), 0);
const tnFails = (n) => (n ? t('{n} falhas', { n }) : t('sem falhas'));

function K({ l, v, s }) {
  return <div className="ah-k"><small>{l}</small><b>{typeof v === 'number' ? fmtNum(v) : v ?? '—'}</b>{s && <span className="muted tiny">{s}</span>}</div>;
}

function HourBars({ rows }) {
  const by = new Map(rows.map(([h, n]) => [new Date(h).getHours() + ':' + new Date(h).getDate(), n]));
  const now = new Date(); now.setMinutes(0, 0, 0);
  const hours = Array.from({ length: 24 }, (_, i) => new Date(now.getTime() - (23 - i) * 3600000));
  const vals = hours.map((d) => by.get(d.getHours() + ':' + d.getDate()) || 0);
  const max = Math.max(1, ...vals);
  return (
    <div className="ah-hours" role="img" aria-label={t('Sincronizações por hora (24 h)')}>
      {hours.map((d, i) => (
        <div key={i} className="ah-h" title={`${d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}: ${vals[i]}`}>
          <i style={{ height: `${(vals[i] / max) * 100}%` }} />
          {i % 6 === 0 && <small>{String(d.getHours()).padStart(2, '0')}h</small>}
        </div>
      ))}
    </div>
  );
}

function ClientErrors({ errors, canClear, onCleared }) {
  const [open, setOpen] = useState(null);
  const clear = async () => {
    if (!window.confirm(t('Apagar todos os erros registrados? Não dá para desfazer.'))) return;
    try { await rpc('admin_clear_client_errors'); onCleared(); } catch (e) { window.alert(tErr(e.message)); }
  };
  const list = errors?.top || [];
  return (
    <section className="card">
      <div className="row-between">
        <h3>{t('Erros do app (7 dias)')}</h3>
        {canClear && list.length > 0 && <button className="link muted ic-row small" onClick={clear}><Trash2 size={14} /> {t('Limpar')}</button>}
      </div>
      {!list.length && <p className="muted small ic-row"><Check size={14} /> {t('Nenhum erro registrado.')}</p>}
      {list.map((e, i) => (
        <div key={i} className="ah-err">
          <button className="ah-err-h" onClick={() => setOpen(open === i ? null : i)}>
            <b>{e.n}×</b><span>{e.message}</span>
            <small className="muted">{t('{n} pessoas', { n: e.users })} · {e.platform || '?'} · {timeAgo(e.last)}</small>
          </button>
          {open === i && <pre className="ah-stack">{`${t('Tela')}: ${e.route || '—'}\n${t('Versão')}: ${e.build || '—'}\n\n${e.stack || t('sem detalhes')}`}</pre>}
        </div>
      ))}
    </section>
  );
}

/** Diagnóstico deste aparelho/navegador, com botão para copiar e mandar ao suporte. */
export function Device() {
  const [copied, setCopied] = useState(false);
  const [quota, setQuota] = useState(null);
  useEffect(() => { navigator.storage?.estimate?.().then(setQuota).catch(() => {}); }, []);
  let lsBytes = 0;
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); lsBytes += (k.length + (localStorage.getItem(k) || '').length) * 2; } } catch { /* sem acesso */ }
  const info = {
    [t('Versão do app')]: BUILD,
    [t('Plataforma')]: platform(),
    [t('Site')]: `${window.location.host} (${SITE_URL.replace(/^https?:\/\//, '')})`,
    [t('Navegador')]: navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 120),
    [t('Tela')]: `${window.screen.width}×${window.screen.height} · ${window.innerWidth}×${window.innerHeight} · ${window.devicePixelRatio}x`,
    [t('Idioma e fuso')]: `${navigator.language} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    [t('Conexão')]: `${navigator.onLine ? t('online') : t('offline')}${navigator.connection?.effectiveType ? ` · ${navigator.connection.effectiveType}` : ''}`,
    [t('Dados guardados')]: `${fmtBytes(lsBytes)}${quota?.usage != null ? ` · ${t('total')} ${fmtBytes(quota.usage)}` : ''}`,
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(Object.entries(info).map(([k, v]) => `${k}: ${v}`).join('\n')); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* sem clipboard */ }
  };
  return (
    <section className="card">
      <div className="row-between"><h3>{t('Este aparelho')}</h3>
        <button className="link ic-row small" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} {t('Copiar diagnóstico')}</button></div>
      <dl className="ah-dl">{Object.entries(info).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </section>
  );
}
