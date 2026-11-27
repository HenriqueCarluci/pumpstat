// Questionário do jogador em passos (um por tela). Usado no primeiro acesso e em Ajustes.
import { useEffect, useState } from 'react';
import { useData } from '../App.jsx';
import { optLabel, QUESTIONS, quizPending, saveQuiz, setQuizPromptOpen, skipQuiz, useQuiz } from '../lib/quiz.js';
import { t } from '../lib/i18n.js';
import { Check, Sparkles, X } from './Icons.jsx';

export default function QuizModal({ initial, onClose, first = false }) {
  const [step, setStep] = useState(first ? -1 : 0);
  const [ans, setAns] = useState(() => ({ skills: [], ...(initial || {}) }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const q = QUESTIONS[step];
  const last = step === QUESTIONS.length - 1;
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  const later = async () => { if (first) await skipQuiz(); onClose(); };
  const pick = (v) => {
    if (q.multi) {
      setAns((a) => {
        const cur = a[q.id] || [];
        if (q.exclusive && v === q.exclusive) return { ...a, [q.id]: cur.includes(v) ? [] : [v] };
        const rest = cur.filter((x) => x !== q.exclusive);
        return { ...a, [q.id]: rest.includes(v) ? rest.filter((x) => x !== v) : rest.length >= q.multi ? rest : [...rest, v] };
      });
    } else {
      setAns((a) => ({ ...a, [q.id]: v }));
      if (!last) setTimeout(() => setStep((s) => s + 1), 180);
    }
  };
  const finish = async () => {
    setBusy(true); setErr('');
    try { await saveQuiz(ans); setStep(QUESTIONS.length); } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div className="tour-backdrop quiz-backdrop" role="presentation">
      <div className="tour-card quiz-card" role="dialog" aria-modal="true" aria-labelledby="quiz-title">
        {step >= 0 && step < QUESTIONS.length && (
          <button type="button" className="quiz-x" onClick={later} aria-label={t('Fechar')}><X size={18} /></button>
        )}
        {step === -1 && (
          <>
            <Sparkles size={28} className="tour-ico" />
            <h3 id="quiz-title">{t('Conte um pouco sobre o seu jogo')}</h3>
            <p className="small">{t('São 5 perguntas rápidas. Com elas, as missões da semana e as recomendações ficam do seu jeito desde o começo.')}</p>
            <div className="tour-actions">
              <button type="button" className="btn" onClick={() => setStep(0)}>{t('Responder agora')}</button>
              <button type="button" className="btn ghost" onClick={later}>{t('Depois')}</button>
            </div>
            <p className="muted tiny">{t('Dá para responder ou refazer quando quiser em Ajustes.')}</p>
          </>
        )}
        {q && (
          <>
            <div className="quiz-dots" aria-hidden="true">{QUESTIONS.map((x, i) => <span key={x.id} className={i <= step ? 'on' : ''} />)}</div>
            <small className="muted">{t('Pergunta {n} de {m}', { n: step + 1, m: QUESTIONS.length })}</small>
            <h3 id="quiz-title">{t(q.q)}</h3>
            {q.hint && <p className="muted small">{t(q.hint)}</p>}
            <div className={`quiz-opts ${q.multi ? 'multi' : ''}`}>
              {q.opts.map(([v, l]) => {
                const on = q.multi ? (ans[q.id] || []).includes(v) : ans[q.id] === v;
                return <button key={v} type="button" className={on ? 'on' : ''} aria-pressed={on} onClick={() => pick(v)}>{on && <Check size={14} />} {t(l)}</button>;
              })}
            </div>
            {err && <div className="form-err">{err}</div>}
            <div className="tour-actions">
              {step > 0 ? <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>{t('Voltar')}</button> : <button type="button" className="btn ghost" onClick={later}>{t('Depois')}</button>}
              {last
                ? <button type="button" className="btn" disabled={busy} onClick={finish}>{t('Concluir')}</button>
                : <button type="button" className="btn" disabled={!q.multi && !ans[q.id]} onClick={() => setStep(step + 1)}>{t('Próximo')}</button>}
            </div>
          </>
        )}
        {step === QUESTIONS.length && (
          <>
            <Check size={28} className="tour-ico" />
            <h3 id="quiz-title">{t('Pronto!')}</h3>
            <p className="small">{t('Suas próximas missões e as recomendações já levam as respostas em conta. Para mudar, é só refazer em Ajustes.')}</p>
            <div className="tour-actions"><button type="button" className="btn" onClick={onClose}>{t('Fechar')}</button></div>
          </>
        )}
      </div>
    </div>
  );
}

/** Pede o questionário uma vez (primeiro acesso de quem ainda não respondeu nem pulou). */
export function QuizPrompt() {
  const { session, plan } = useData();
  const s = useQuiz();
  const [closed, setClosed] = useState(false);
  const [active, setActive] = useState(false);
  const pending = !!session && !!plan && (!plan.view_as || plan.view_as.test) && quizPending(s);
  // depois de aberto, fica na tela até a pessoa fechar (mesmo já respondido, para mostrar o "Pronto!")
  useEffect(() => { if (pending && !closed) { setActive(true); setQuizPromptOpen(true); } }, [pending, closed]);
  if (closed || !(active || pending)) return null;
  return <QuizModal first onClose={() => { setClosed(true); setQuizPromptOpen(false); }} />;
}

/** Cartão em Ajustes: resumo das respostas e botão para responder ou refazer. */
export function QuizCard() {
  const s = useQuiz();
  const [open, setOpen] = useState(false);
  const quiz = s?.quiz;
  const lines = quiz ? QUESTIONS.filter((x) => quiz[x.id] && (!Array.isArray(quiz[x.id]) || quiz[x.id].length))
    .map((x) => [x.id, Array.isArray(quiz[x.id]) ? quiz[x.id].map((v) => t(optLabel(x.id, v))).join(', ') : t(optLabel(x.id, quiz[x.id]))]) : [];
  const LBL = { exp: 'Experiência', freq: 'Frequência', goal: 'Objetivo', mode: 'Modo', skills: 'Quer melhorar' };
  return (
    <section className="card quiz-summary">
      <h3 className="ic-row"><Sparkles size={17} /> {t('Seu jeito de jogar')}</h3>
      <p className="muted small">{t('As respostas ajustam as missões da semana e as recomendações.')}</p>
      {lines.length > 0 && <dl>{lines.map(([k, v]) => <div key={k}><dt>{t(LBL[k])}</dt><dd>{v}</dd></div>)}</dl>}
      <button type="button" className="btn ghost" onClick={() => setOpen(true)}>{quiz ? t('Refazer o questionário') : t('Responder o questionário')}</button>
      {open && <QuizModal initial={quiz} onClose={() => setOpen(false)} />}
    </section>
  );
}
