-- Migração 0018 — guarda de transição + invariante A1 + RPCs da dor (feature 004)
-- architecture.md §2.5/§2.6/§2.8; ADR-004B; spec §7 CA2-CA13/CA20/CA21; security.md RS-D4/RS-D5/RS-D6/RS-D9.
-- Depende de: 0015 (dor), 0017 (anexo_dor), 0006 (verificação/perfil), 0004 (helpers), 0008 (audit).

-- ── Função dor_publicavel: fonte única da invariante A1 (ADR-004B) ─────────
-- Retorna true quando AMBAS as condições forem satisfeitas:
--   (a) aprovado_por IS NOT NULL (admin aprovou)
--   (b) autor tem perfil.verificado_em NOT NULL (verificou o e-mail)
-- Fail-closed: qualquer falha retorna false (nunca publica por erro).
create or replace function public.dor_publicavel(p_dor_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_aprovado  boolean;
  v_verificado boolean;
begin
  select (d.aprovado_por is not null) into v_aprovado
    from public.dor d where d.id = p_dor_id;
  if not found or not coalesce(v_aprovado, false) then return false; end if;
  select (p.verificado_em is not null) into v_verificado
    from public.dor d
    join public.perfil p on p.user_id = d.autor_id
   where d.id = p_dor_id;
  return coalesce(v_verificado, false);
exception when others then return false;  -- fail-closed
end; $$;

-- ── Guarda de transição (BEFORE UPDATE on dor) ────────────────────────────
-- Valida de→para × papel; rejeição exige motivo; submit exige empresa+consentimento.
-- Transições permitidas (RN2):
--   rascunho     → em_moderacao  (autor verificado, via submeter_dor)
--   em_moderacao → publicada     (derivado A1 — só via moderar_dor ou trigger de verificação)
--   em_moderacao → rejeitada     (admin, via moderar_dor; motivo obrigatório)
--   rejeitada    → em_moderacao  (autor verificado, reenvio via submeter_dor)
create or replace function public._dor_guarda_transicao()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_de  text := old.status_dor::text;
  v_para text := new.status_dor::text;
begin
  -- Se o status não mudou, deixa passar (UPDATE de conteúdo)
  if v_de = v_para then return new; end if;

  -- Matriz de transições permitidas
  case
    when v_de = 'rascunho' and v_para = 'em_moderacao' then
      -- OK: só valida (submeter_dor ou submeter_dor_landing fazem as verificações de negócio)
      null;
    when v_de = 'em_moderacao' and v_para = 'publicada' then
      -- Só via dor_publicavel (A1 satisfeita); disparado por moderar_dor ou trigger de verificação
      if not public.dor_publicavel(new.id) then
        raise exception 'publicacao requer aprovacao do admin E verificacao do autor (A1)';
      end if;
    when v_de = 'em_moderacao' and v_para = 'rejeitada' then
      -- Rejeição exige motivo (RN11)
      if new.motivo_rejeicao is null or length(btrim(new.motivo_rejeicao)) = 0 then
        raise exception 'motivo_rejeicao obrigatorio ao rejeitar (RN11)';
      end if;
    when v_de = 'rejeitada' and v_para = 'em_moderacao' then
      -- Reenvio: OK
      null;
    else
      raise exception 'transicao de estado invalida: % -> % (RN2)', v_de, v_para;
  end case;

  return new;
end; $$;

create trigger dor_guarda_transicao before update on public.dor
  for each row execute function public._dor_guarda_transicao();

-- ── submeter_dor: rascunho|rejeitada → em_moderacao (autor verificado) ────
-- Gate de verificação (RN19): exige esta_verificado().
-- Gate de submit (arch §2.6): empresa_id NOT NULL + consentimento = true.
create or replace function public.submeter_dor(p_dor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_dor public.dor%rowtype;
begin
  if v_uid is null then raise exception 'sessao necessaria'; end if;
  -- Gate de verificação (RN19 — exceto landing, tratada em submeter_dor_landing)
  if not (select public.esta_verificado()) then
    raise exception 'conta nao verificada: verifique seu e-mail antes de submeter (RN19)';
  end if;
  select * into v_dor from public.dor where id = p_dor_id and deleted_at is null;
  if not found then raise exception 'dor nao encontrada'; end if;
  -- Só o autor dono pode submeter
  if v_dor.autor_id <> v_uid then raise exception 'apenas o autor pode submeter sua dor'; end if;
  -- Estado de origem deve ser rascunho ou rejeitada
  if v_dor.status_dor not in ('rascunho', 'rejeitada') then
    raise exception 'apenas dores em rascunho ou rejeitada podem ser submetidas';
  end if;
  -- Empresa canônica obrigatória (CA2/RN6)
  if v_dor.empresa_id is null then
    raise exception 'empresa_id obrigatorio para submeter a dor (RN6/CA2)';
  end if;
  -- Consentimento LGPD obrigatório (CA3/RN7)
  if not coalesce(v_dor.consentimento, false) or v_dor.consent_version is null then
    raise exception 'consentimento LGPD obrigatorio para submeter (RN7/CA3)';
  end if;
  -- Transição para em_moderacao (guarda de transição valida)
  update public.dor
     set status_dor = 'em_moderacao',
         updated_at = now()
   where id = p_dor_id;
end; $$;
grant execute on function public.submeter_dor(uuid) to authenticated;

-- ── submeter_dor_landing: exceção estreita do gate de verificação (RN16/RN19/arch §2.8) ──
-- Cria a dor JÁ em em_moderacao para autor ainda não verificado.
-- É o ato que originou o cadastro — única escrita permitida antes de verificar.
-- NUNCA anon: exige sessão (login já ocorreu via OAuth — security §4.3).
create or replace function public.submeter_dor_landing(
  p_empresa_id    uuid,
  p_descricao     text,
  p_rep_nome      text,
  p_departamento  text,
  p_cargo         text,
  p_consentimento boolean,
  p_consent_version text,
  p_consent_at    timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := (select auth.uid());
  v_dor_id uuid;
begin
  if v_uid is null then raise exception 'sessao necessaria (nao pode ser anon)'; end if;
  -- Empresa canônica obrigatória
  if p_empresa_id is null then raise exception 'empresa_id obrigatorio (RN6)'; end if;
  -- Consentimento obrigatório
  if not coalesce(p_consentimento, false) or p_consent_version is null then
    raise exception 'consentimento LGPD obrigatorio (RN7)';
  end if;
  -- Descrição não pode ser vazia
  if p_descricao is null or length(btrim(p_descricao)) = 0 then
    raise exception 'descricao nao pode ser vazia';
  end if;
  -- Cria a dor diretamente em em_moderacao (RN4 — landing)
  -- Bypassa o trigger de transição usando INSERT direto no estado correto.
  insert into public.dor (
    autor_id, empresa_id, status_dor, descricao,
    rep_nome, departamento, cargo,
    consentimento, consent_version, consent_at,
    created_by
  ) values (
    v_uid, p_empresa_id, 'em_moderacao', p_descricao,
    coalesce(p_rep_nome, ''), p_departamento, p_cargo,
    p_consentimento, p_consent_version, p_consent_at,
    v_uid
  ) returning id into v_dor_id;
  return v_dor_id;
end; $$;
grant execute on function public.submeter_dor_landing(uuid, text, text, text, text, boolean, text, timestamptz) to authenticated;

-- ── moderar_dor: aprovar | rejeitar (exclusivo do admin — RN10) ────────────
-- Aprovar: registra aprovado_por/aprovado_em; se dor_publicavel → publica.
-- Rejeitar: exige motivo (RN11); registra motivo_rejeicao.
create or replace function public.moderar_dor(
  p_dor_id uuid,
  p_acao   text,   -- 'aprovar' | 'rejeitar'
  p_motivo text    -- obrigatório em 'rejeitar'
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_dor public.dor%rowtype;
begin
  if not (select public.is_admin()) then raise exception 'apenas admin pode moderar (RN10/CA6)'; end if;
  select * into v_dor from public.dor where id = p_dor_id and deleted_at is null;
  if not found then raise exception 'dor nao encontrada'; end if;
  if v_dor.status_dor <> 'em_moderacao' then
    raise exception 'apenas dores em_moderacao podem ser moderadas';
  end if;
  if p_acao = 'aprovar' then
    -- Registra quem aprovou + quando (RN13)
    update public.dor
       set aprovado_por = v_uid,
           aprovado_em  = now(),
           updated_at   = now()
     where id = p_dor_id;
    -- Se A1 satisfeita (autor já verificado): publica agora (CA7)
    -- Se não (CA10): mantém em_moderacao com aprovado_por preenchido (par = "aprovada-aguardando")
    if public.dor_publicavel(p_dor_id) then
      update public.dor
         set status_dor   = 'publicada',
             publicada_em = now(),
             updated_at   = now()
       where id = p_dor_id;
    end if;
  elsif p_acao = 'rejeitar' then
    if p_motivo is null or length(btrim(p_motivo)) = 0 then
      raise exception 'motivo_rejeicao obrigatorio para rejeitar (RN11/CA8)';
    end if;
    update public.dor
       set status_dor       = 'rejeitada',
           motivo_rejeicao  = p_motivo,
           updated_at       = now()
     where id = p_dor_id;
  else
    raise exception 'acao invalida: % (use aprovar ou rejeitar)', p_acao;
  end if;
end; $$;
grant execute on function public.moderar_dor(uuid, text, text) to authenticated;

-- ── Trigger AFTER UPDATE OF verificado_em ON perfil (CA11 — "verificação destrava") ──
-- Quando o autor verifica o e-mail, re-avalia as dores em_moderacao com aprovado_por not null
-- e as publica (A1 via dor_publicavel). Fail-closed: se dor_publicavel retornar false, nada acontece.
create or replace function public._perfil_verificacao_destrava_dor()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_dor_id uuid;
begin
  -- Só age quando verificado_em passa de NULL para NOT NULL
  if old.verificado_em is not null or new.verificado_em is null then
    return new;
  end if;
  -- Re-avalia as dores em_moderacao com aprovado_por not null deste autor
  for v_dor_id in
    select id from public.dor
     where autor_id = new.user_id
       and status_dor = 'em_moderacao'
       and aprovado_por is not null
       and deleted_at is null
  loop
    if public.dor_publicavel(v_dor_id) then
      update public.dor
         set status_dor   = 'publicada',
             publicada_em = now(),
             updated_at   = now()
       where id = v_dor_id;
    end if;
  end loop;
  return new;
exception when others then
  -- Fail-closed: falha no trigger não impede a verificação da conta
  return new;
end; $$;

create trigger perfil_verificacao_destrava_dor after update of verificado_em on public.perfil
  for each row execute function public._perfil_verificacao_destrava_dor();

-- ── remover_anexo_admin: remoção admin auditada de anexo impróprio (RS-A7) ─
create or replace function public.remover_anexo_admin(p_anexo_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'apenas admin pode remover anexo (RS-A7)'; end if;
  update public.anexo_dor
     set deleted_at = now(),
         deleted_by = (select auth.uid())
   where id = p_anexo_id and deleted_at is null;
  if not found then raise exception 'anexo nao encontrado ou ja removido'; end if;
end; $$;
grant execute on function public.remover_anexo_admin(uuid) to authenticated;
