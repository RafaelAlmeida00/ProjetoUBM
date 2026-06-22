-- 0076 — Caminho B (envio livre) funcional + seguro em confirmar_assinatura
--
-- Bug (descoberto em prod): a assinatura nasce com origem='autentique' (o host inicia
-- pelo Autentique), mas o ramo upload_livre de confirmar_assinatura exigia
-- origem='upload_livre' para casar → NUNCA casava → no-op silencioso (Caminho B morto).
--
-- Correção: o ramo upload_livre casa pelo documento_id (qualquer origem), pois o rep pode
-- escolher enviar o PDF assinado por conta própria em vez de assinar no Autentique. Ao
-- confirmar, marca origem='upload_livre'.
--
-- Segurança (fechando um buraco que esta correção abriria): o ramo upload_livre agora EXIGE
-- o representante da empresa (is_company_rep) ou admin — antes não havia gate de ator, e
-- habilitar o casamento por documento_id deixaria qualquer authenticated selar a proposta.
-- O ramo autentique (webhook/service_role) permanece como está.
--
-- Depende de: 0074 (confirmar_assinatura vigente), 0004 (is_admin/is_company_rep).
-- Re-afirma grants (lição 0063). Rollback: re-aplicar a confirmar_assinatura da 0074.

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
  v_empresa uuid;
begin
  if p_origem = 'autentique' then
    select a.documento_id, d.projeto_id into v_doc, v_projeto
      from public.assinatura a join public.documento_proposta d on d.id = a.documento_id
     where a.origem = 'autentique' and a.provedor_doc_id = p_chave and a.status <> 'assinada'
     for update;
  else
    -- Caminho B: casa pelo documento_id (qualquer origem) + exige representante/admin.
    select a.documento_id, d.projeto_id, d.empresa_id into v_doc, v_projeto, v_empresa
      from public.assinatura a join public.documento_proposta d on d.id = a.documento_id
     where a.documento_id = p_chave::uuid and a.status <> 'assinada' and d.superado_em is null
     for update;
    if v_doc is not null
       and not (select public.is_company_rep(v_empresa))
       and not (select public.is_admin()) then
      raise exception 'confirmar_assinatura (envio livre) exige o representante da empresa (RN3/CA9)';
    end if;
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
     set status     = 'assinada',
         origem     = case when p_origem = 'upload_livre' then 'upload_livre'::public.origem_assinatura else origem end,
         assinado_em = now(),
         evidencias  = p_evidencias,
         hash_sha256 = p_evidencias->>'hash_sha256',
         updated_at  = now()
   where documento_id = v_doc;

  -- Sinaliza ao guard que a virada vem da RPC confirmar_assinatura (que já validou o ator).
  -- Necessário para o Caminho B (rep autenticado): sem isso o guard exige auth.uid()=NULL
  -- (service_role/webhook) ou admin. GUC txn-local; um UPDATE direto malicioso não chega aqui
  -- (RLS de projeto só permite admin/host; rep não tem policy de UPDATE direto).
  perform set_config('app.confirmando_assinatura', '1', true);
  update public.projeto set status = 'proposta_aprovada', updated_at = now()
   where id = v_projeto and status = 'proposta_em_analise';
  perform set_config('app.confirmando_assinatura', '', true);
  -- notificação: trigger _assinatura_notificar_aprovacao (0073)
end; $$;

revoke all     on function public.confirmar_assinatura(public.origem_assinatura, text, text, jsonb) from public, anon;
grant  execute on function public.confirmar_assinatura(public.origem_assinatura, text, text, jsonb) to authenticated, service_role;

-- ── Guard: permitir →proposta_aprovada quando a virada vem de confirmar_assinatura ──
-- Recria _projeto_guarda_transicao IDÊNTICA à 0069, mudando SÓ o ramo proposta_aprovada:
-- além de auth.uid()=NULL (service_role/webhook) e admin, aceita o GUC app.confirmando_assinatura='1'
-- (setado por confirmar_assinatura, que já validou o representante). Habilita o Caminho B (rep).
create or replace function public._projeto_guarda_transicao()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_de         text := old.status::text;
  v_para       text := new.status::text;
  v_uid        uuid := (select auth.uid());
  v_empresa_id uuid;
begin
  if v_de = v_para then return new; end if;

  case
    when v_de = 'em_analise' and v_para = 'aprovado' then
      if not (select public.is_project_host(new.id)) and not (select public.is_admin()) then
        raise exception 'fechar equipe (em_analise->aprovado) exige host ou admin (RN10/CA9)';
      end if;

    when v_de = 'aprovado' and v_para = 'aguardando_proposta' then
      if not (select public.is_project_host(new.id)) and not (select public.is_admin()) then
        raise exception 'transicao aprovado->aguardando_proposta exige host ou admin (RN17/CA14)';
      end if;

    when v_de = 'aguardando_proposta' and v_para = 'proposta_em_analise' then
      if not (select public.is_project_host(new.id)) and not (select public.is_admin()) then
        raise exception 'aguardando_proposta->proposta_em_analise exige host ou admin (RN1/CA1)';
      end if;

    when v_de = 'proposta_em_analise' and v_para = 'proposta_aprovada' then
      -- confirmar_assinatura (GUC) OU service_role/webhook (auth.uid NULL) OU admin.
      if coalesce(current_setting('app.confirmando_assinatura', true), '') <> '1'
         and (select auth.uid()) is not null
         and not (select public.is_admin()) then
        raise exception 'proposta_em_analise->proposta_aprovada so via RPC confirmar_assinatura ou admin (RS4)';
      end if;

    when v_de = 'proposta_em_analise' and v_para = 'aguardando_proposta' then
      if v_uid is not null then
        select d.empresa_id into v_empresa_id
          from public.projeto pj
          join public.dor d on d.id = pj.dor_id
         where pj.id = new.id;
        if not (select public.is_company_rep(v_empresa_id)) and not (select public.is_admin()) then
          raise exception 'proposta_em_analise->aguardando_proposta exige representante da empresa ou admin (CA11)';
        end if;
      end if;

    when v_de = 'proposta_aprovada' and v_para = 'em_execucao' then
      if not (select public.is_project_host(new.id)) and not (select public.is_admin()) then
        raise exception 'proposta_aprovada->em_execucao exige host ou admin (RN18a/CA16)';
      end if;

    when v_de = 'em_execucao' and v_para = 'finalizado' then
      if not (select public.is_project_host(new.id)) and not (select public.is_admin()) then
        raise exception 'em_execucao->finalizado exige host ou admin (RN18b/CA17)';
      end if;

    else
      if not (select public.is_admin()) then
        raise exception 'transicao de estado invalida: % -> % (RN23)', v_de, v_para;
      end if;
  end case;

  insert into public.status_evento (projeto_id, de_status, para_status, autor_id, motivo)
  values (new.id, old.status, new.status, v_uid,
          nullif(current_setting('app.transicao_motivo', true), ''));

  return new;
end; $$;

revoke all on function public._projeto_guarda_transicao() from public, anon, authenticated;
