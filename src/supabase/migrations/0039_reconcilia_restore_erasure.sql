-- ─── 0039: reconciliação restore_record + erasure_titular (merge 004↔005↔007) ───
-- POR QUÊ: 0027 (004) e 0036 (005) redefiniram estas funções EM PARALELO, cada uma a
-- partir da própria base, sem a união dos ramos. O último writer da cadeia (0036)
-- clobberou: (a) o ramo 'paleta' do restore_record (0025/007) e (b) a extensão de
-- identidade da erasure_titular (0027/004: membro_empresa.departamento/cargo +
-- aluno_curso). Evidência: testes 0025 (3 fail) e 0027 (2 fail) com a cadeia completa.
-- REGRA (da própria 0025): CREATE OR REPLACE substitui a função INTEIRA → re-listar
-- TODOS os ramos herdados. "Aditivo" sem união = regressão silenciosa.

-- ─── restore_record: allowlist UNIÃO ──────────────────────────────────────────
-- 0009/0011 (curso, empresa) + 0020 (dor, anexo_dor) + 0025 (paleta) +
-- 0036 (projeto, membro_equipe, indicacao, funcao_tarefa).
-- status_evento NÃO entra (append-only, padrão 0036).
create or replace function public.restore_record(p_tabela text, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'apenas admin'; end if;

  if p_tabela = 'curso' then
    update public.curso set deleted_at = null, deleted_by = null where id = p_id;
    insert into audit.record_version (tabela, record_id, op, record)
      values ('public.curso', p_id, 'RESTORE', jsonb_build_object('id', p_id));

  elsif p_tabela = 'empresa' then
    update public.empresa set deleted_at = null, deleted_by = null where id = p_id and merged_into is null;
    insert into audit.record_version (tabela, record_id, op, record)
      values ('public.empresa', p_id, 'RESTORE', jsonb_build_object('id', p_id));

  elsif p_tabela = 'dor' then
    update public.dor set deleted_at = null, deleted_by = null where id = p_id;
    insert into audit.record_version (tabela, record_id, op, record)
      values ('public.dor', p_id, 'RESTORE', jsonb_build_object('id', p_id));

  elsif p_tabela = 'anexo_dor' then
    update public.anexo_dor set deleted_at = null, deleted_by = null where id = p_id;
    insert into audit.record_version (tabela, record_id, op, record)
      values ('public.anexo_dor', p_id, 'RESTORE', jsonb_build_object('id', p_id));

  elsif p_tabela = 'paleta' then
    -- ramo da 0025 (007): restore NÃO reativa (ativação é ato explícito via ativar_paleta)
    update public.paleta set deleted_at = null, deleted_by = null where id = p_id;
    insert into audit.record_version (tabela, record_id, op, record)
      values ('public.paleta', p_id, 'RESTORE', jsonb_build_object('id', p_id));

  elsif p_tabela = 'projeto' then
    update public.projeto set deleted_at = null, deleted_by = null where id = p_id;
    insert into audit.record_version (tabela, record_id, op, record)
      values ('public.projeto', p_id, 'RESTORE', jsonb_build_object('id', p_id));

  elsif p_tabela = 'membro_equipe' then
    update public.membro_equipe set deleted_at = null, deleted_by = null where id = p_id;
    insert into audit.record_version (tabela, record_id, op, record)
      values ('public.membro_equipe', p_id, 'RESTORE', jsonb_build_object('id', p_id));

  elsif p_tabela = 'indicacao' then
    update public.indicacao set deleted_at = null, deleted_by = null where id = p_id;
    insert into audit.record_version (tabela, record_id, op, record)
      values ('public.indicacao', p_id, 'RESTORE', jsonb_build_object('id', p_id));

  elsif p_tabela = 'funcao_tarefa' then
    update public.funcao_tarefa set deleted_at = null, deleted_by = null where id = p_id;
    insert into audit.record_version (tabela, record_id, op, record)
      values ('public.funcao_tarefa', p_id, 'RESTORE', jsonb_build_object('id', p_id));

  else
    raise exception 'tabela nao restauravel: %', p_tabela;
  end if;
end; $$;

-- ─── erasure_titular: corpo UNIÃO ─────────────────────────────────────────────
-- 0010 (perfil/auth/notificacao) + 0020 (PII da dor viva) + 0027 (membro_empresa
-- dept/cargo + aluno_curso, RS-ID5/RS-ID-LGPD1) + 0036 (indicacao.mensagem +
-- status_evento.motivo, §9.1.4a/RS13 — linha append-only PRESERVADA).
create or replace function public.erasure_titular(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'apenas admin'; end if;
  -- Herdado 0010
  update public.perfil set nome_publico = '[removido]', avatar_url = null where user_id = p_user_id;
  update auth.users set email = 'removed-' || p_user_id::text || '@example.invalid' where id = p_user_id;
  update public.notificacao set payload = '{}'::jsonb where destinatario_id = p_user_id;
  -- Herdado 0020: PII da dor viva
  update public.dor
     set rep_nome = '[removido]', descricao = '[removido]', departamento = null, cargo = null, updated_at = now()
   where autor_id = p_user_id and deleted_at is null;
  -- 0027 (004): identidade do representante + vínculos de educação do titular
  update public.membro_empresa
     set departamento = null,
         cargo        = null
   where user_id = p_user_id;
  delete from public.aluno_curso where user_id = p_user_id;
  -- 0036 (005): PII livre — preserva a linha append-only de status_evento
  update public.indicacao    set mensagem = '[removido]' where pessoa_id = p_user_id and mensagem is not null;
  update public.status_evento set motivo  = '[removido]' where autor_id  = p_user_id and motivo  is not null;
  -- Intenção de apagar objetos Storage do titular (execução real fora do banco)
  insert into audit.record_version (tabela, record_id, op, record)
    values ('public.anexo_dor', p_user_id, 'ERASURE_STORAGE_PENDING',
            jsonb_build_object('user_id', p_user_id, 'nota', 'objetos Storage do titular a apagar no real (Onda 4)'));
  -- Anonimiza o log de auditoria (UNIÃO das chaves: 0010+0020+0027+0036)
  update audit.record_version
     set record     = record     - 'nome_publico' - 'email' - 'rep_nome' - 'dor' - 'avatar_url' - 'descricao' - 'departamento' - 'cargo' - 'mensagem' - 'motivo',
         old_record = old_record - 'nome_publico' - 'email' - 'rep_nome' - 'dor' - 'avatar_url' - 'descricao' - 'departamento' - 'cargo' - 'mensagem' - 'motivo'
   where actor_id = p_user_id or record_id = p_user_id;
  insert into audit.record_version (tabela, record_id, op, record)
    values ('public.perfil', p_user_id, 'ERASURE', jsonb_build_object('user_id', p_user_id));
end; $$;

-- ─── hardening: padrão 0025/0038 (revoke public E anon; grant mínimo) ─────────
-- Supabase AUTO-CONCEDE execute a anon/authenticated em função nova/redefinida
-- ('revoke from public' não basta — anon explícito; PGlite não replica o auto-grant).
revoke execute on function public.restore_record(text, uuid) from public, anon;
grant  execute on function public.restore_record(text, uuid) to authenticated;
revoke execute on function public.erasure_titular(uuid) from public, anon;
grant  execute on function public.erasure_titular(uuid) to authenticated;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ DOWN (rollback): re-aplicar as definições da 0036 (restore_record /        ║
-- ║ erasure_titular) — estado anterior a esta reconciliação.                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
