-- 0074 — Dedupe de notificações: triggers (0073) são o canônico; remove notif INLINE das RPCs
--
-- Bug de coordenação descoberto na aplicação (Onda 6): as RPCs da 0068 (enviar_proposta,
-- confirmar_assinatura, contrapropor_proposta) e o job da 0071 (expirar_propostas) chamavam
-- `criar_notificacao` INLINE, e a 0073 adicionou TRIGGERS que notificam os MESMOS eventos →
-- notificação DUPLICADA. Os triggers (0073) são o mecanismo declarativo canônico (cobrem host
-- + equipe + recusada/expirada). Esta migração RE-CRIA as 4 funções SEM a notificação inline.
--
-- Eventos (agora só pelos triggers da 0073):
--   enviar_proposta      → INSERT assinatura → trigger _assinatura_notificar_envio (rep, proposta_recebida)
--   confirmar_assinatura → UPDATE assinatura='assinada' → trigger _assinatura_notificar_aprovacao (host+equipe)
--   contrapropor_proposta→ INSERT contraproposta → trigger _contraproposta_notificar_host (host)
--   expirar_propostas    → UPDATE assinatura='expirada' → trigger _assinatura_notificar_aprovacao (host)
--
-- Re-afirma grants (CREATE OR REPLACE reseta — lição 0063).
-- Depende de: 0068, 0071, 0073.
-- Rollback: re-aplicar 0068/0071 (versões com notif inline).

-- A) enviar_proposta — sem notif inline
create or replace function public.enviar_proposta(
  p_projeto_id    uuid,
  p_storage_path  text,
  p_origem        public.origem_assinatura
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid        uuid := (select auth.uid());
  v_empresa_id uuid;
  v_rep_id     uuid;
  v_doc_id     uuid;
begin
  if not (select public.is_project_host(p_projeto_id)) then
    raise exception 'enviar_proposta exige o host do projeto (CA1)';
  end if;
  if not (select public.esta_verificado()) then
    raise exception 'enviar_proposta exige conta verificada (CA3)';
  end if;
  if not exists (
    select 1 from public.projeto
    where id = p_projeto_id and status = 'aguardando_proposta' and deleted_at is null
  ) then
    raise exception 'enviar_proposta exige projeto em aguardando_proposta (CA2)';
  end if;

  select d.empresa_id into v_empresa_id
    from public.projeto pj join public.dor d on d.id = pj.dor_id
   where pj.id = p_projeto_id;

  select me.user_id into v_rep_id
    from public.membro_empresa me
   where me.empresa_id = v_empresa_id
     and not exists (select 1 from public.admin_app aa where aa.user_id = me.user_id)
   limit 1;

  if v_rep_id is null then
    raise exception 'empresa sem representante não-admin para assinar (CA9)';
  end if;

  insert into public.documento_proposta
    (projeto_id, tipo, empresa_id, enviado_por, storage_path_original, created_by)
  values (p_projeto_id, 'proposta', v_empresa_id, v_uid, p_storage_path, v_uid)
  returning id into v_doc_id;

  insert into public.assinatura (documento_id, origem, signatario_id, status)
  values (v_doc_id, p_origem, v_rep_id, 'pendente');

  update public.projeto set status = 'proposta_em_analise', updated_at = now()
   where id = p_projeto_id;
  -- notificação: trigger _assinatura_notificar_envio (0073)
end; $$;

-- B) confirmar_assinatura — sem notif inline
create or replace function public.confirmar_assinatura(
  p_origem        public.origem_assinatura,
  p_chave         text,
  p_storage_path  text,
  p_evidencias    jsonb
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_doc     uuid;
  v_projeto uuid;
begin
  if p_origem = 'autentique' then
    select a.documento_id, d.projeto_id into v_doc, v_projeto
      from public.assinatura a join public.documento_proposta d on d.id = a.documento_id
     where a.origem = 'autentique' and a.provedor_doc_id = p_chave and a.status <> 'assinada'
     for update;
  else
    select a.documento_id, d.projeto_id into v_doc, v_projeto
      from public.assinatura a join public.documento_proposta d on d.id = a.documento_id
     where a.origem = 'upload_livre' and a.documento_id = p_chave::uuid
       and a.status <> 'assinada' and d.superado_em is null
     for update;
  end if;

  if v_doc is null then return; end if;

  if p_storage_path is null then
    raise exception 'prova assinada ausente — status NAO vira proposta_aprovada (RN11/CA6)';
  end if;

  update public.documento_proposta
     set storage_path_assinado = p_storage_path,
         manifesto_auditoria   = case when p_origem = 'autentique' then p_evidencias else manifesto_auditoria end,
         updated_at = now()
   where id = v_doc;

  update public.assinatura
     set status='assinada', assinado_em=now(), evidencias=p_evidencias,
         hash_sha256=p_evidencias->>'hash_sha256', updated_at=now()
   where documento_id = v_doc;

  update public.projeto set status='proposta_aprovada', updated_at=now()
   where id = v_projeto and status = 'proposta_em_analise';
  -- notificação: trigger _assinatura_notificar_aprovacao (0073)
end; $$;

-- C) contrapropor_proposta — sem notif inline
create or replace function public.contrapropor_proposta(p_projeto_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid        uuid := (select auth.uid());
  v_empresa_id uuid;
  v_doc_id     uuid;
begin
  if p_motivo is null or length(btrim(p_motivo)) = 0 then
    raise exception 'contraproposta exige motivo não vazio (CA11/RN14)';
  end if;
  if not exists (
    select 1 from public.projeto where id = p_projeto_id and status = 'proposta_em_analise' and deleted_at is null
  ) then
    raise exception 'contrapropor exige projeto em proposta_em_analise (CA11)';
  end if;

  select d.empresa_id into v_empresa_id
    from public.projeto pj join public.dor d on d.id = pj.dor_id where pj.id = p_projeto_id;

  if not (select public.is_company_rep(v_empresa_id)) then
    raise exception 'contrapropor exige representante da empresa da dor (CA11)';
  end if;

  select id into v_doc_id from public.documento_proposta
   where projeto_id = p_projeto_id and superado_em is null and deleted_at is null
   order by created_at desc limit 1;
  if v_doc_id is null then
    raise exception 'documento de proposta vigente não encontrado';
  end if;

  update public.assinatura set status='cancelada', updated_at=now()
   where documento_id = v_doc_id and status <> 'assinada';
  update public.documento_proposta set superado_em=now(), updated_at=now() where id = v_doc_id;

  insert into public.contraproposta (projeto_id, documento_id, motivo, criado_por)
  values (p_projeto_id, v_doc_id, btrim(p_motivo), v_uid);

  update public.projeto
     set rodadas_contraproposta = rodadas_contraproposta + 1,
         alerta_negociacao = (rodadas_contraproposta + 1) >= 3,
         updated_at = now()
   where id = p_projeto_id;

  update public.projeto set status='aguardando_proposta', updated_at=now() where id = p_projeto_id;
  -- notificação: trigger _contraproposta_notificar_host (0073)
end; $$;

-- D) expirar_propostas — sem notif inline
create or replace function public.expirar_propostas()
returns void language plpgsql security definer set search_path = '' as $$
declare
  rec record;
begin
  for rec in
    select a.id as assinatura_id, a.documento_id, d.projeto_id
      from public.assinatura a
      join public.documento_proposta d  on d.id  = a.documento_id
      join public.projeto             pj on pj.id = d.projeto_id
     where a.status='enviada' and pj.status='proposta_em_analise'
       and pj.deleted_at is null and d.deleted_at is null and d.superado_em is null
       and a.created_at < now() - interval '60 days'
  loop
    update public.assinatura set status='expirada', updated_at=now() where id = rec.assinatura_id;
    update public.documento_proposta set superado_em=now(), updated_at=now() where id = rec.documento_id;
    perform set_config('app.transicao_motivo', 'expiracao_60d', true);
    update public.projeto set status='aguardando_proposta', updated_at=now()
     where id = rec.projeto_id and status='proposta_em_analise';
    perform set_config('app.transicao_motivo', '', true);
    -- notificação: trigger _assinatura_notificar_aprovacao (0073) ao marcar 'expirada'
  end loop;
end; $$;

-- Re-afirmar grants (CREATE OR REPLACE reseta — lição 0063)
revoke all on function public.enviar_proposta(uuid, text, public.origem_assinatura) from public, anon;
grant execute on function public.enviar_proposta(uuid, text, public.origem_assinatura) to authenticated;
revoke all on function public.confirmar_assinatura(public.origem_assinatura, text, text, jsonb) from public, anon;
grant execute on function public.confirmar_assinatura(public.origem_assinatura, text, text, jsonb) to authenticated, service_role;
revoke all on function public.contrapropor_proposta(uuid, text) from public, anon;
grant execute on function public.contrapropor_proposta(uuid, text) to authenticated;
revoke all on function public.expirar_propostas() from public, anon;
grant execute on function public.expirar_propostas() to authenticated, service_role;
