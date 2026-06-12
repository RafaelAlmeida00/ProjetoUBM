-- Migração 0020 — notificações da dor + restore + erasure estendida (feature 004)
-- architecture.md §4 (0020); spec §7 CA4/CA7/CA8; security.md RS-LGPD1; plan §2.3 (confronto).
-- Depende de: 0018 (RPCs moderar_dor/submeter_dor), 0010 (criar_notificacao/tipo_notificacao), 0009 (restore_record).
--
-- DECISÃO (plan §2.2): reusar 'status_mudou' com payload discriminado em vez de ADD VALUE.
-- Justificativa: ADD VALUE não pode ser usado na mesma transação em que é referenciado (Postgres real),
-- e o PGlite pode não suportar. payload = {evento: 'dor_em_moderacao'|'dor_publicada'|'dor_rejeitada'}
-- é equivalente funcionalmente e não requer transação separada. Teste guia (tasks §T-O1.6 §2.3).
--
-- ALTERNATIVA futura: se os valores forem adicionados via ALTER TYPE ADD VALUE numa migração ISOLADA
-- (sem uso na mesma transação), podem ser migrados nessa forma. A decisão presente é conservadora.

-- ── Gatilhos de notificação na dor ──────────────────────────────────────────
-- Trigger AFTER INSERT/UPDATE ON dor para disparar criar_notificacao via service_role.
-- Usa security definer para ter acesso a criar_notificacao (que é service_role-only).
create or replace function public._dor_notificar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_admin_id uuid;
begin
  -- Nova dor em em_moderacao → notificar todos os admins (CA4/RN13)
  if new.status_dor = 'em_moderacao' and (old is null or old.status_dor <> 'em_moderacao') then
    for v_admin_id in select user_id from public.admin_app loop
      perform public.criar_notificacao(
        v_admin_id,
        'status_mudou',
        jsonb_build_object(
          'evento', 'dor_em_moderacao',
          'dor_id', new.id::text
        )
      );
    end loop;
  end if;

  -- Dor publicada → notificar autor (CA7/RN13)
  if new.status_dor = 'publicada' and (old is null or old.status_dor <> 'publicada') then
    perform public.criar_notificacao(
      new.autor_id,
      'status_mudou',
      jsonb_build_object(
        'evento', 'dor_publicada',
        'dor_id', new.id::text
      )
    );
  end if;

  -- Dor rejeitada → notificar autor com motivo (CA8/RN11)
  if new.status_dor = 'rejeitada' and (old is null or old.status_dor <> 'rejeitada') then
    perform public.criar_notificacao(
      new.autor_id,
      'status_mudou',
      jsonb_build_object(
        'evento', 'dor_rejeitada',
        'dor_id', new.id::text,
        'motivo', new.motivo_rejeicao   -- payload mínimo sem PII excedente (RS-LGPD3)
      )
    );
  end if;

  return new;
exception when others then
  -- Fail-soft: erro de notificação não impede a transação principal (outbox é o canal de re-entrega)
  return new;
end; $$;

create trigger dor_notificar after insert or update of status_dor on public.dor
  for each row execute function public._dor_notificar();

-- ── restore_record estendido: allowlist += 'dor', 'anexo_dor' (RN20/ADR-0007) ───────
-- Redefine a função adicionando os novos casos à allowlist (padrão aditivo, como 0011).
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
    -- Restaurar dor soft-deletada (RN20)
    update public.dor set deleted_at = null, deleted_by = null where id = p_id;
    insert into audit.record_version (tabela, record_id, op, record)
      values ('public.dor', p_id, 'RESTORE', jsonb_build_object('id', p_id));
  elsif p_tabela = 'anexo_dor' then
    -- Restaurar anexo soft-deletado (RN20)
    update public.anexo_dor set deleted_at = null, deleted_by = null where id = p_id;
    insert into audit.record_version (tabela, record_id, op, record)
      values ('public.anexo_dor', p_id, 'RESTORE', jsonb_build_object('id', p_id));
  else
    raise exception 'tabela nao restauravel: %', p_tabela;
  end if;
end; $$;
-- grant mantido igual à 0011 (authenticated, gate is_admin interno)
grant execute on function public.restore_record(text, uuid) to authenticated;

-- ── erasure_titular estendida: anonimiza PII da dor viva + Storage (RS-LGPD1) ────────
-- Redefine a função adicionando anonimização dos campos PII da dor (rep_nome/descricao/departamento/cargo).
-- Apagar objetos do Storage do titular: registra na auditoria para que o Maestro execute no real.
-- (A deleção real do Storage é server-only via MCP/CLI na Onda 4 — aqui apenas registramos a intenção.)
create or replace function public.erasure_titular(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'apenas admin'; end if;
  -- Anonimiza perfil e auth (herdado de 0010)
  update public.perfil set nome_publico = '[removido]', avatar_url = null where user_id = p_user_id;
  update auth.users set email = 'removed-' || p_user_id::text || '@example.invalid' where id = p_user_id;
  update public.notificacao set payload = '{}'::jsonb where destinatario_id = p_user_id;
  -- Anonimiza PII da dor viva (RS-LGPD1 — campos declarados: rep_nome/descricao/departamento/cargo)
  update public.dor
     set rep_nome     = '[removido]',
         descricao    = '[removido]',
         departamento = null,
         cargo        = null,
         updated_at   = now()
   where autor_id = p_user_id and deleted_at is null;
  -- Registra intenção de apagar objetos Storage do titular (execução real é Onda 4 / Maestro)
  insert into audit.record_version (tabela, record_id, op, record)
    values (
      'public.anexo_dor',
      p_user_id,
      'ERASURE_STORAGE_PENDING',
      jsonb_build_object('user_id', p_user_id, 'nota', 'objetos Storage do titular a apagar no real (Onda 4)')
    );
  -- Anonimiza log de auditoria (herdado de 0010 + campos da dor)
  update audit.record_version
     set record     = record     - 'nome_publico' - 'email' - 'rep_nome' - 'dor' - 'avatar_url' - 'descricao' - 'departamento' - 'cargo',
         old_record = old_record - 'nome_publico' - 'email' - 'rep_nome' - 'dor' - 'avatar_url' - 'descricao' - 'departamento' - 'cargo'
   where actor_id = p_user_id or record_id = p_user_id;
  insert into audit.record_version (tabela, record_id, op, record)
    values ('public.perfil', p_user_id, 'ERASURE', jsonb_build_object('user_id', p_user_id));
end; $$;
grant execute on function public.erasure_titular(uuid) to authenticated;
