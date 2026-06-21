-- 0063 — Janela de indicação DESACOPLADA do status (decisão do cliente 2026-06-21).
--
-- Problema: "Reabrir indicações" (0060) regredia o status para em_analise, e indicar_se (0032)
-- só aceitava em em_analise. Equipe que perdia membros em fase avançada, sem ninguém mais
-- indicado, ficava SEM SAÍDA (não dava pra trazer gente nova sem regredir o projeto).
--
-- Correção:
--  - Nova coluna projeto.indicacoes_abertas (booleano) controla a janela de indicação,
--    INDEPENDENTE do status.
--  - reabrir_indicacoes / encerrar_indicacoes (admin OU host, QUALQUER fase, incl. finalizado)
--    alternam a flag SEM tocar no status (nunca regride a etapa).
--  - indicar_se passa a aceitar (status = em_analise) OU (indicacoes_abertas).
-- Rollback: drop function encerrar_indicacoes; restaurar reabrir_indicacoes/indicar_se da
--           0060/0032; alter table projeto drop column indicacoes_abertas.

-- ── 1) Coluna de estado da janela ──────────────────────────────────────────────
alter table public.projeto
  add column if not exists indicacoes_abertas boolean not null default false;

-- ── 2) indicar_se: aceita em_analise OU indicacoes_abertas (RN9 revisada) ───────
create or replace function public.indicar_se(
  p_projeto_id        uuid,
  p_papel_pretendido  public.papel_pretendido,
  p_mensagem          text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  -- Gate de verificação (RN8/CA7)
  if not (select public.esta_verificado()) then
    raise exception 'conta nao verificada nao pode indicar-se (RN8/CA7)';
  end if;

  -- Janela de indicação: em_analise (inicial) OU indicações reabertas (qualquer fase) (RN9 revisada)
  if not exists (
    select 1 from public.projeto
    where id = p_projeto_id and deleted_at is null
      and (status = 'em_analise' or indicacoes_abertas = true)
  ) then
    raise exception 'projeto nao esta com indicacoes abertas — janela fechada (RN9/CA8)';
  end if;

  insert into public.indicacao (projeto_id, pessoa_id, papel_pretendido, mensagem, created_by)
  values (p_projeto_id, v_uid, p_papel_pretendido, p_mensagem, v_uid)
  returning id into v_id;

  return v_id;
end; $$;

-- ── 3) reabrir_indicacoes: admin OU host; abre a janela SEM regredir status ─────
create or replace function public.reabrir_indicacoes(p_projeto_id uuid)
returns void language plpgsql security definer set search_path to ''
as $function$
begin
  if not ((select public.is_admin()) or (select public.is_project_host(p_projeto_id))) then
    raise exception 'reabrir_indicacoes exige o host do projeto ou admin';
  end if;
  if not exists (select 1 from public.projeto where id = p_projeto_id and deleted_at is null) then
    raise exception 'projeto não encontrado';
  end if;
  -- Abre a janela em QUALQUER fase, sem tocar no status (decisão 2026-06-21: nunca regride).
  update public.projeto set indicacoes_abertas = true, updated_at = now()
   where id = p_projeto_id;
end; $function$;

-- ── 4) encerrar_indicacoes: admin OU host; fecha a janela (status inalterado) ───
create or replace function public.encerrar_indicacoes(p_projeto_id uuid)
returns void language plpgsql security definer set search_path to ''
as $function$
begin
  if not ((select public.is_admin()) or (select public.is_project_host(p_projeto_id))) then
    raise exception 'encerrar_indicacoes exige o host do projeto ou admin';
  end if;
  update public.projeto set indicacoes_abertas = false, updated_at = now()
   where id = p_projeto_id and deleted_at is null;
end; $function$;

-- ── 5) Grants / re-hardening (CREATE OR REPLACE pode resetar; anon sempre revogado) ──
revoke all     on function public.indicar_se(uuid, public.papel_pretendido, text) from public, anon;
grant  execute on function public.indicar_se(uuid, public.papel_pretendido, text) to authenticated;
revoke all     on function public.reabrir_indicacoes(uuid)  from public, anon;
grant  execute on function public.reabrir_indicacoes(uuid)  to authenticated;
revoke all     on function public.encerrar_indicacoes(uuid) from public, anon;
grant  execute on function public.encerrar_indicacoes(uuid) to authenticated;
