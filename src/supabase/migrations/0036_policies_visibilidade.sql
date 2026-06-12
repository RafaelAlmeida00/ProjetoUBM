-- Migração 0036 — visibilidade da indicação + vitrine pseudonimizada + restore allowlist + erasure (feature 005)
-- architecture.md §5/§7; tasks.md T-O1.7, T-O1.11; security.md RS2, RS9, RS10, RS13.
-- RN20, RN23, RN24, RN25, RN26 · CA23, CA24, CA25, CA26.
-- Depende de: 0031 (is_dor_course_coordinator), 0032 (indicacao), 0033 (membro_equipe),
--             0009/0020 (restore_record, erasure_titular — redefinição aditiva), 0003 (perfil.ranking_optin).

-- ── Visibilidade da indicação (RN25/RS2): coord-do-curso-da-dor + admin (+ próprio da 0032) ──
-- Políticas permissivas são OR-combinadas com indicacao_select_propria (0032).
create policy indicacao_select_coord on public.indicacao
  for select to authenticated
  using (
    (select public.is_dor_course_coordinator(projeto_id))
    or (select public.is_admin())
  );

-- ── Vitrine pública pseudonimizada (RS9/RN24) ───────────────────────────────
-- NUNCA retornam pessoa_id/user_id/e-mail cru. Nome só quando perfil.ranking_optin=true;
-- senão NULL (a UI mostra papel+curso anônimo). SECURITY DEFINER: o perfil não é legível por anon (0005).
create or replace function public.equipe_publica(p_projeto_id uuid)
returns table (papel_projeto text, nome text, curso text)
language sql stable security definer set search_path = '' as $$
  select me.papel_projeto::text,
         case when p.ranking_optin then p.nome_publico else null end,
         (select string_agg(c.nome, ', ' order by c.nome)
            from public.coordenador_curso cc
            join public.curso c on c.id = cc.curso_id
           where cc.user_id = me.pessoa_id)
  from public.membro_equipe me
  join public.perfil p on p.user_id = me.pessoa_id
  where me.projeto_id = p_projeto_id and me.deleted_at is null
  order by me.papel_projeto;
$$;

create or replace function public.timeline_publica(p_projeto_id uuid)
returns table (de_status text, para_status text, ocorrido_em timestamptz, motivo text, autor_nome text)
language sql stable security definer set search_path = '' as $$
  select se.de_status::text, se.para_status::text, se.ocorrido_em, se.motivo,
         case when ap.ranking_optin then ap.nome_publico else null end
  from public.status_evento se
  left join public.perfil ap on ap.user_id = se.autor_id
  where se.projeto_id = p_projeto_id
  order by se.ocorrido_em;
$$;

-- ── restore_record: allowlist estendida (+projeto/membro_equipe/indicacao/funcao_tarefa) ──
-- Redefinição ADITIVA (padrão 0020). status_evento NÃO entra (append-only).
create or replace function public.restore_record(p_tabela text, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'apenas admin'; end if;
  if p_tabela = 'curso' then
    update public.curso set deleted_at = null, deleted_by = null where id = p_id;
    insert into audit.record_version (tabela, record_id, op, record) values ('public.curso', p_id, 'RESTORE', jsonb_build_object('id', p_id));
  elsif p_tabela = 'empresa' then
    update public.empresa set deleted_at = null, deleted_by = null where id = p_id and merged_into is null;
    insert into audit.record_version (tabela, record_id, op, record) values ('public.empresa', p_id, 'RESTORE', jsonb_build_object('id', p_id));
  elsif p_tabela = 'dor' then
    update public.dor set deleted_at = null, deleted_by = null where id = p_id;
    insert into audit.record_version (tabela, record_id, op, record) values ('public.dor', p_id, 'RESTORE', jsonb_build_object('id', p_id));
  elsif p_tabela = 'anexo_dor' then
    update public.anexo_dor set deleted_at = null, deleted_by = null where id = p_id;
    insert into audit.record_version (tabela, record_id, op, record) values ('public.anexo_dor', p_id, 'RESTORE', jsonb_build_object('id', p_id));
  elsif p_tabela = 'projeto' then
    update public.projeto set deleted_at = null, deleted_by = null where id = p_id;
    insert into audit.record_version (tabela, record_id, op, record) values ('public.projeto', p_id, 'RESTORE', jsonb_build_object('id', p_id));
  elsif p_tabela = 'membro_equipe' then
    update public.membro_equipe set deleted_at = null, deleted_by = null where id = p_id;
    insert into audit.record_version (tabela, record_id, op, record) values ('public.membro_equipe', p_id, 'RESTORE', jsonb_build_object('id', p_id));
  elsif p_tabela = 'indicacao' then
    update public.indicacao set deleted_at = null, deleted_by = null where id = p_id;
    insert into audit.record_version (tabela, record_id, op, record) values ('public.indicacao', p_id, 'RESTORE', jsonb_build_object('id', p_id));
  elsif p_tabela = 'funcao_tarefa' then
    update public.funcao_tarefa set deleted_at = null, deleted_by = null where id = p_id;
    insert into audit.record_version (tabela, record_id, op, record) values ('public.funcao_tarefa', p_id, 'RESTORE', jsonb_build_object('id', p_id));
  else
    raise exception 'tabela nao restauravel: %', p_tabela;
  end if;
end; $$;
grant execute on function public.restore_record(text, uuid) to authenticated;

-- ── erasure_titular: estende p/ PII livre nova da 005 (status_evento.motivo, indicacao.mensagem) ──
-- §9.1.4a/RS13 — append-only PRESERVADO: a LINHA permanece; só o texto livre é anonimizado.
create or replace function public.erasure_titular(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'apenas admin'; end if;
  -- Herdado (002/004)
  update public.perfil set nome_publico = '[removido]', avatar_url = null where user_id = p_user_id;
  update auth.users set email = 'removed-' || p_user_id::text || '@example.invalid' where id = p_user_id;
  update public.notificacao set payload = '{}'::jsonb where destinatario_id = p_user_id;
  update public.dor
     set rep_nome = '[removido]', descricao = '[removido]', departamento = null, cargo = null, updated_at = now()
   where autor_id = p_user_id and deleted_at is null;
  insert into audit.record_version (tabela, record_id, op, record)
    values ('public.anexo_dor', p_user_id, 'ERASURE_STORAGE_PENDING',
            jsonb_build_object('user_id', p_user_id, 'nota', 'objetos Storage do titular a apagar no real (Onda 4)'));
  -- NOVO (005): PII livre — preserva a linha append-only de status_evento
  update public.indicacao    set mensagem = '[removido]' where pessoa_id = p_user_id and mensagem is not null;
  update public.status_evento set motivo  = '[removido]' where autor_id  = p_user_id and motivo  is not null;
  -- Anonimiza o log de auditoria (campos herdados + mensagem/motivo da 005)
  update audit.record_version
     set record     = record     - 'nome_publico' - 'email' - 'rep_nome' - 'dor' - 'avatar_url' - 'descricao' - 'departamento' - 'cargo' - 'mensagem' - 'motivo',
         old_record = old_record - 'nome_publico' - 'email' - 'rep_nome' - 'dor' - 'avatar_url' - 'descricao' - 'departamento' - 'cargo' - 'mensagem' - 'motivo'
   where actor_id = p_user_id or record_id = p_user_id;
  insert into audit.record_version (tabela, record_id, op, record)
    values ('public.perfil', p_user_id, 'ERASURE', jsonb_build_object('user_id', p_user_id));
end; $$;
grant execute on function public.erasure_titular(uuid) to authenticated;

-- ── Grants das RPCs públicas (anon + authenticated; hardening final na 0038) ──
grant execute on function public.equipe_publica(uuid)   to anon, authenticated;
grant execute on function public.timeline_publica(uuid) to anon, authenticated;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  DOWN (rollback — restore_record/erasure_titular revertem à definição 0020)║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- drop function if exists public.timeline_publica(uuid);
-- drop function if exists public.equipe_publica(uuid);
-- drop policy if exists indicacao_select_coord on public.indicacao;
-- (restore_record / erasure_titular: re-aplicar a versão da 0020)
-- ╚══════════════════════════════════════════════════════════════════════════╝
