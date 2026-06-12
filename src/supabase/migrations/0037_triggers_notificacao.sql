-- Migração 0037 — triggers de notificação da 005 (feature 005)
-- architecture.md §7; tasks.md T-O1.8; security.md RS12.
-- RN3, RN28 (a/b/c) · CA2, CA27.
-- Depende de: 0010 (criar_notificacao, tipo_notificacao), 0030 (projeto), 0033 (membro_equipe),
--             0016 (dor_curso/curso_ubm), 0003 (curso/coordenador_curso).
--
-- Gatilhos (reuso de tipo_notificacao existente — sem ALTER TYPE):
--   (a) ABERTURA do projeto → 'dor_aprovada_curso' aos coordenadores dos cursos da dor (PONTE curso, RN3/CA2)
--   (b) FECHAMENTO da equipe (INSERT membro_equipe) → 'status_mudou' {equipe_fechada}/{eleito_host} (RN28b/CA27)
--   (c) MUDANÇA de estado do projeto → 'status_mudou' {projeto_avancou} à equipe (RN28c)
-- Todos FAIL-SOFT (erro de notificação não regride a transação). Payload SEM PII (RS12).

-- ── (a) Abertura → coordenadores dos cursos da dor (ponte curso §9.1.1) ──────
create or replace function public._projeto_notificar_abertura()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_coord uuid;
begin
  for v_coord in
    select distinct cc.user_id
      from public.dor_curso dc
      join public.curso c            on c.slug      = dc.curso
      join public.coordenador_curso cc on cc.curso_id = c.id
     where dc.dor_id = new.dor_id
  loop
    perform public.criar_notificacao(
      v_coord, 'dor_aprovada_curso',
      jsonb_build_object('evento','projeto_aberto','dor_id', new.dor_id::text, 'projeto_id', new.id::text));
  end loop;
  return new;
exception when others then
  return new; -- fail-soft: erro de notificação não impede a abertura
end; $$;

create trigger projeto_notificar_abertura
  after insert on public.projeto
  for each row execute function public._projeto_notificar_abertura();

-- ── (b) Fechamento da equipe → notifica cada membro (host vs demais) ─────────
create or replace function public._membro_equipe_notificar()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.criar_notificacao(
    new.pessoa_id, 'status_mudou',
    jsonb_build_object(
      'evento', case when new.papel_projeto = 'host' then 'eleito_host' else 'equipe_fechada' end,
      'projeto_id', new.projeto_id::text));
  return new;
exception when others then
  return new; -- fail-soft
end; $$;

create trigger membro_equipe_notificar
  after insert on public.membro_equipe
  for each row execute function public._membro_equipe_notificar();

-- ── (c) Mudança de estado do projeto → notifica a equipe ────────────────────
create or replace function public._projeto_notificar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_membro uuid;
begin
  if new.status = old.status then return new; end if;
  for v_membro in
    select pessoa_id from public.membro_equipe
     where projeto_id = new.id and deleted_at is null
  loop
    perform public.criar_notificacao(
      v_membro, 'status_mudou',
      jsonb_build_object('evento','projeto_avancou','projeto_id', new.id::text, 'para_status', new.status::text));
  end loop;
  return new;
exception when others then
  return new; -- fail-soft
end; $$;

create trigger projeto_notificar
  after update of status on public.projeto
  for each row execute function public._projeto_notificar();

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  DOWN (rollback — na ordem inversa)                                       ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- drop trigger if exists projeto_notificar on public.projeto;
-- drop function if exists public._projeto_notificar();
-- drop trigger if exists membro_equipe_notificar on public.membro_equipe;
-- drop function if exists public._membro_equipe_notificar();
-- drop trigger if exists projeto_notificar_abertura on public.projeto;
-- drop function if exists public._projeto_notificar_abertura();
-- ╚══════════════════════════════════════════════════════════════════════════╝
