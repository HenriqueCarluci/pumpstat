import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../App.jsx';
import { rpc } from '../lib/api.js';
import { isOn } from '../lib/plans.js';
import { TeamLogo } from '../lib/teams.jsx';
import { Flag, useCountries } from '../lib/country.jsx';
import { fmtNum, locale, t, tErr, tn } from '../lib/i18n.js';
import { Ball } from '../components/ui.jsx';
import { Chips } from './Songs.jsx';
import TeamReport from '../components/TeamReport.jsx';
import { Avatar } from './Players.jsx';
import { Crown, Shield, Trophy, Users } from '../components/Icons.jsx';

const SORTS = { pumb: (m) => m.pumbility ?? -1, D: (m) => m.max_d ?? -1, S: (m) => m.max_s ?? -1, clears: (m) => m.clears };

/** Meu Time: participantes, ranking (PUMBILITY, maior Double, maior Single) e a semana do time. */
export default function MyTeam() {
  const { version, plan } = useData();
  const [info, setInfo] = useState(undefined);
  const [err, setErr] = useState('');
  const [sort, setSort] = useState('pumb');
  useEffect(() => {
    let alive = true;
    setInfo(undefined);
    rpc('my_team', { p_version: version }).then((r) => alive && setInfo(r)).catch((e) => alive && setErr(tErr(e.message)));
    return () => { alive = false; };
  }, [version]);
  const members = info?.members || [];
  const ccOf = useCountries(members.map((m) => m.id));
  const ranked = useMemo(() => [...members].sort((a, b) => SORTS[sort](b) - SORTS[sort](a) || (b.pumbility ?? 0) - (a.pumbility ?? 0)), [members, sort]);

  if (!isOn(plan, 'teams')) return <div className="page"><p className="empty">{t('Este recurso está desligado no momento.')}</p></div>;
  if (err) return <div className="page"><p className="empty">{err}</p></div>;
  if (info === undefined) return <div className="page"><p className="empty">{t('Carregando…')}</p></div>;
  if (!info) {
    return (
      <div className="page">
        <h2 className="ic-row"><Shield size={20} /> {t('Meu Time')}</h2>
        <section className="card center">
          <p>{t('Você ainda não está em nenhum time.')}</p>
          <p className="muted small">{t('Escolha seu time em Ajustes. Se ele ainda não existe, você pode pedir o cadastro por lá.')}</p>
          <Link className="btn" to="/ajustes">{t('Escolher time')}</Link>
        </section>
      </div>
    );
  }

  const tm = info.team;
  const best = (k) => members.reduce((a, m) => (m[k] != null && (a == null || m[k] > a[k]) ? m : a), null);
  const bestD = best('max_d'), bestS = best('max_s'), bestP = best('pumbility');
  const withP = members.filter((m) => m.pumbility != null);
  const avgP = withP.length ? withP.reduce((s, m) => s + Number(m.pumbility), 0) / withP.length : null;
  const online = members.filter((m) => m.online && !m.me);
  const wk = info.week || {};
  const fmtP = (v) => (v == null ? '—' : fmtNum(Math.round(Number(v))));

  return (
    <div className="page my-team">
      <section className="card mt-hero">
        {tm.logo ? <TeamLogo team={tm} size={64} /> : <span className="mt-logo-ph"><Shield size={30} /></span>}
        <div className="mt-hero-info">
          <h2>{tm.name}</h2>
          <div className="muted small">{[tm.tag, tm.city].filter(Boolean).join(' · ')}</div>
          <div className="mt-hero-tags">
            <span className="tag"><Users size={12} /> {tn(members.length, '{n} participante', '{n} participantes')}</span>
            {online.length > 0 && <span className="tag on"><span className="dot-on" /> {tn(online.length, '{n} online agora', '{n} online agora')}</span>}
            {tm.instagram && <a className="tag" href={`https://instagram.com/${tm.instagram}`} target="_blank" rel="noopener noreferrer">Instagram @{tm.instagram}</a>}
          </div>
        </div>
      </section>

      <section className="mt-stats">
        <div className="mt-stat"><small>{t('Maior Double')}</small>{bestD ? <><b className="ic-row"><Ball chart={{ mode: 'D', level: bestD.max_d }} size="sm" /> D{bestD.max_d}</b><span>{bestD.nickname}</span></> : <b>—</b>}</div>
        <div className="mt-stat"><small>{t('Maior Single')}</small>{bestS ? <><b className="ic-row"><Ball chart={{ mode: 'S', level: bestS.max_s }} size="sm" /> S{bestS.max_s}</b><span>{bestS.nickname}</span></> : <b>—</b>}</div>
        <div className="mt-stat"><small>{t('Maior PUMBILITY')}</small><b>{fmtP(bestP?.pumbility)}</b><span>{bestP?.nickname || ''}</span></div>
        <div className="mt-stat"><small>{t('PUMBILITY média')}</small><b>{fmtP(avgP)}</b></div>
        <div className="mt-stat wide"><small>{t('Semana do time')}</small>
          <b>{tn(wk.plays || 0, '{n} jogada', '{n} jogadas')}</b>
          <span>{t('{p} passes · {a} jogando', { p: fmtNum(wk.passes || 0), a: fmtNum(wk.active || 0) })}</span>
        </div>
      </section>

      <div className="filters">
        <Chips value={sort} onChange={setSort} options={[['pumb', 'PUMBILITY'], ['D', t('Maior Double')], ['S', t('Maior Single')], ['clears', t('Clears')]]} />
      </div>

      <ol className="mt-list">
        {ranked.map((m, i) => {
          const body = (
            <>
              <span className={`mt-rank r${i + 1}`}>{i < 3 ? <Trophy size={14} /> : null}{i + 1}</span>
              <Avatar p={m} size={40} />
              <div className="mt-main">
                <div className="mt-nick"><Flag cc={ccOf(m.id)} /><b>{m.nickname || t('Jogador')}</b>{m.me && <span className="tag">{t('você')}</span>}{m.online && !m.me && <span className="dot-on" title={t('online agora')} />}</div>
                {m.title && <div className="muted tiny mt-title">{m.title}</div>}
                <div className="mt-levels">
                  {m.max_d != null && <Ball chart={{ mode: 'D', level: m.max_d }} size="sm" />}
                  {m.max_s != null && <Ball chart={{ mode: 'S', level: m.max_s }} size="sm" />}
                  <span className="muted tiny">{tn(m.clears, '{n} clear', '{n} clears')}</span>
                </div>
              </div>
              <div className="mt-pumb"><small>PUMBILITY</small><b>{fmtP(m.pumbility)}</b></div>
            </>
          );
          return (
            <li key={m.id} className={m.me ? 'me' : ''}>
              {m.me || !m.friend ? <div className="mt-row">{body}</div> : <Link className="mt-row" to={`/jogador/${m.id}`}>{body}</Link>}
            </li>
          );
        })}
      </ol>
      <TeamReport />

      <p className="muted tiny">{t('Maior nível passado sem quebrar, na versão atual. Toque num amigo para comparar as notas.')}
        {' '}{t('No time desde {d}.', { d: new Date(members.find((m) => m.me)?.joined || Date.now()).toLocaleDateString(locale(), { day: '2-digit', month: 'short', year: 'numeric' }) })}</p>
      {plan?.admin && <p className="muted tiny"><Crown size={12} /> {t('Times e participantes são gerenciados em Administração.')}</p>}
    </div>
  );
}
