// Página do chart no modo visitante: capa, níveis da música, tier e tags. Sem notas, comunidade ou social.
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData } from '../App.jsx';
import { Ball, Jacket, RiseBadge } from '../components/ui.jsx';
import { chartTier, fmtBpm, TIERS } from '../lib/piu.js';
import { SpecialBadges } from '../components/Special.jsx';
import { isUnique } from '../lib/special.js';
import { chartTagLabel, tagColor } from '../lib/tags.js';
import { reviewTagLabel } from '../components/ChartReviews.jsx';
import { fmtNum, t } from '../lib/i18n.js';
import { ChevronLeft, PencilLine, Users } from '../components/Icons.jsx';
import { setGuest } from '../lib/guest.js';

export default function GuestChart() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data } = useData();
  const c = data.byId.get(Number(id));
  if (!c) return <div className="page"><p className="empty">{t('Chart não encontrado nesta versão.')}</p><Link to="/" className="btn ghost">{t('Voltar')}</Link></div>;
  const song = c.song;
  const tier = TIERS.find((x) => x.id === chartTier(c));
  const commTags = c.community?.tags || [];
  return (
    <div className="page chart-page">
      <div className="cp-top">
        <button className="icon-btn" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} aria-label={t('Voltar')}><ChevronLeft size={22} /></button>
        <span className="cp-song">{song.title}</span>
      </div>
      <section className="cp-hero">
        <Jacket song={song} width={640} className="cp-jacket" />
        <span className="cp-ball"><Ball chart={c} /></span>
      </section>
      <div className="cp-levels" role="tablist" aria-label={t('Outros níveis da música')}>
        {song.charts.map((x) => (
          <Link key={x.id} to={`/chart/${x.id}`} replace className={`cp-lv ${x.id === c.id ? 'on' : ''}`} aria-current={x.id === c.id}>
            <Ball chart={x} size="sm" />
          </Link>
        ))}
      </div>
      <div className="cp-actions">
        <span className="cp-badges">
          {isUnique(c) && <span className="tag tier-special">Unique</span>}
          {tier && tier.id !== 'unknown' && <span className={`tag tier-${tier.id}`}>{t(tier.label)}</span>}
          <SpecialBadges chart={c} compact />
          {song.rise && <RiseBadge small />}
        </span>
      </div>
      {(c.tagBars || commTags.length > 0) && (
        <section className="card cp-tags">
          <h3>{t('Tags')}</h3>
          {c.tagBars && (
            <div className="cp-skill">
              {c.tagBars.slice(0, 3).map(([x, v]) => (
                <div key={x} className="cp-skill-row"><span>{t(chartTagLabel(x))}</span><i><b style={{ width: `${v}%`, background: tagColor(x) }} /></i><em>{v}%</em></div>
              ))}
            </div>
          )}
          {c.tags?.length > 3 && <p className="small muted">{c.tags.map((x) => t(chartTagLabel(x))).join(' · ')}</p>}
          {commTags.length > 0 && (
            <p className="small muted cp-comm"><Users size={12} /> {t('Comunidade do PIU Stats:')} {commTags.map((x) => t(reviewTagLabel(Array.isArray(x) ? x[0] : x))).join(' · ')}</p>
          )}
        </section>
      )}
      <section className="card cp-info">
        <h3>{t('Detalhes')}</h3>
        <dl>
          {song.bpm && <><dt>BPM</dt><dd>{fmtBpm(song.bpm)}</dd></>}
          <dt>{t('Artista')}</dt><dd>{song.artist || '—'}</dd>
          {c.stepArtist && <><dt>{t('Step')}</dt><dd className="ic-row"><PencilLine size={12} /> {c.stepArtist}</dd></>}
          {c.notes ? <><dt>{t('Notas')}</dt><dd>{fmtNum(c.notes)}</dd></> : null}
          {tier && tier.id !== 'unknown' && <><dt>{t('Tier')}</dt><dd>{t(tier.label)}</dd></>}
        </dl>
      </section>
      <section className="card guest-cta">
        <p>{t('Entre para ver seus recordes, notas e o seu progresso neste chart.')}</p>
        <button type="button" className="btn" onClick={() => setGuest(false)}>{t('Entrar ou criar conta')}</button>
      </section>
    </div>
  );
}
