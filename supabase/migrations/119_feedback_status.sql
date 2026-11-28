-- 119: status do suporte usados pelas filas de correção diária e de melhorias semanais (114/118).
alter table public.feedback drop constraint if exists feedback_status_check;
alter table public.feedback add constraint feedback_status_check
  check (status in ('open', 'done', 'fixed', 'need_info', 'wontfix', 'answered', 'approved', 'rejected', 'implemented'));
