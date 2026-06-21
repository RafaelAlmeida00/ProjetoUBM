-- 0068 — RPCs de proposta/assinatura/execução da feature 006
--
-- Ordem das RPCs:
--   A) enviar_proposta        (host envia, cria documento+assinatura, → proposta_em_analise)
--   B) confirmar_assinatura   (idempotente por origem; prova ANTES do status — RN11)
--   C) contrapropor_proposta  (representante; motivo; → aguardando_proposta; alerta ≥3)
--   D) iniciar_execucao       (host; proposta_aprovada → em_execucao)
--   E) finalizar_projeto      (host; em_execucao → finalizado)
--
-- Coluna auxiliar (contador de rodadas + flag de alerta):
--   projeto.alerta_negociacao (boolean) — sinalizada quando contraprop ≥ 3 (RN16b/CA14)
--   projeto.rodadas_contraproposta (int) — contador interno
--
-- Depende de: 0064 (enums), 0065 (documento_proposta), 0066 (assinatura), 0067 (contraproposta),
--             0031 (helpers is_project_host/is_project_coordinator), 0004 (is_admin/is_company_rep/esta_verificado),
--             0010 (criar_notificacao), 0030 (projeto/status_projeto)
--
-- Grants: re-afirmados no final (lição 0063 — CREATE OR REPLACE reseta para PUBLIC).
-- Hardening completo na 0072.
--
-- Rollback:
--   drop function if exists public.finalizar_projeto(uuid);
--   drop function if exists public.iniciar_execucao(uuid);
--   drop function if exists public.contrapropor_proposta(uuid, text);
--   drop function if exists public.confirmar_assinatura(public.origem_assinatura, text, text, jsonb);
--   drop function if exists public.enviar_proposta(uuid, text, public.origem_assinatura);
--   alter table public.projeto drop column if exists alerta_negociacao;
--   alter table public.projeto drop column if exists rodadas_contraproposta;

-- ── Colunas auxiliares na tabela projeto ─────────────────────────────────────
alter table public.projeto
  add column if not exists alerta_negociacao       boolean not null default false,
  add column if not exists rodadas_contraproposta  int     not null default 0;

-- ══════════════════════════════════════════════════════════════════════════════
-- A) enviar_proposta: host envia; cria documento_proposta + assinatura; → proposta_em_analise
-- ══════════════════════════════════════════════════════════════════════════════
-- Valida: is_project_host + esta_verificado + estado aguardando_proposta.
-- Signatário = representante da empresa da dor (nunca admin — CA9).
-- A guarda _projeto_guarda_transicao (0060→0069) valida o par de→para no UPDATE.
-- SECURITY DEFINER set search_path = '' (RS5/arch §4.1).
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
  -- Gate: host do projeto
  if not (select public.is_project_host(p_projeto_id)) then
    raise exception 'enviar_proposta exige o host do projeto (CA1)';
  end if;
  -- Gate: conta verificada (CA3)
  if not (select public.esta_verificado()) then
    raise exception 'enviar_proposta exige conta verificada (CA3)';
  end if;
  -- Gate: estado aguardando_proposta (CA2)
  if not exists (
    select 1 from public.projeto
    where id = p_projeto_id and status = 'aguardando_proposta' and deleted_at is null
  ) then
    raise exception 'enviar_proposta exige projeto em aguardando_proposta (CA2)';
  end if;

  -- Localiza empresa da dor (via projeto→dor→empresa)
  select d.empresa_id into v_empresa_id
    from public.projeto pj
    join public.dor d on d.id = pj.dor_id
   where pj.id = p_projeto_id;

  -- Localiza representante da empresa (primeiro membro ativo — CA9)
  -- Admin NUNCA é signatário (RN3/CA9): exclui quem está em admin_app
  select me.user_id into v_rep_id
    from public.membro_empresa me
   where me.empresa_id = v_empresa_id
     and not exists (select 1 from public.admin_app aa where aa.user_id = me.user_id)
   limit 1;

  if v_rep_id is null then
    raise exception 'empresa sem representante não-admin para assinar (CA9)';
  end if;

  -- INSERT documento_proposta
  insert into public.documento_proposta
    (projeto_id, tipo, empresa_id, enviado_por, storage_path_original, created_by)
  values
    (p_projeto_id, 'proposta', v_empresa_id, v_uid, p_storage_path, v_uid)
  returning id into v_doc_id;

  -- INSERT assinatura (status inicial: pendente para upload_livre; enviada para autentique
  --   — o adapter externo seta provedor_doc_id+status=enviada após criar o pedido)
  insert into public.assinatura
    (documento_id, origem, signatario_id, status)
  values
    (v_doc_id, p_origem, v_rep_id, 'pendente');

  -- UPDATE projeto → proposta_em_analise (a guarda grava status_evento)
  update public.projeto
     set status = 'proposta_em_analise', updated_at = now()
   where id = p_projeto_id;

  -- Notifica representante (proposta_recebida — RN24a) — fail-soft
  begin
    perform public.criar_notificacao(
      v_rep_id, 'proposta_recebida',
      jsonb_build_object('projeto_id', p_projeto_id::text, 'documento_id', v_doc_id::text)
    );
  exception when others then null;
  end;
end; $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- B) confirmar_assinatura: idempotente por origem; prova ANTES do status (RN11)
-- ══════════════════════════════════════════════════════════════════════════════
-- Caminho A (autentique): chave = provedor_doc_id
-- Caminho B (upload_livre): chave = documento_id::text; rejeita doc superado_em (CA12)
-- No-op se já assinada (CA7/CA25). Raise se storage_path null (CA6/RN11).
-- Chamado pelo webhook (service_role) ou pela Server Action do upload (authenticated sob RLS).
create or replace function public.confirmar_assinatura(
  p_origem        public.origem_assinatura,
  p_chave         text,     -- A: provedor_doc_id; B: documento_id::text
  p_storage_path  text,     -- caminho do PDF assinado JÁ persistido (RN11)
  p_evidencias    jsonb
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_doc     uuid;
  v_projeto uuid;
  v_host    uuid;
begin
  -- Localiza a assinatura NÃO assinada (idempotência por origem — RN10/CA7/CA25)
  if p_origem = 'autentique' then
    select a.documento_id, d.projeto_id into v_doc, v_projeto
      from public.assinatura a
      join public.documento_proposta d on d.id = a.documento_id
     where a.origem = 'autentique'
       and a.provedor_doc_id = p_chave
       and a.status <> 'assinada'
     for update;
  else  -- upload_livre
    select a.documento_id, d.projeto_id into v_doc, v_projeto
      from public.assinatura a
      join public.documento_proposta d on d.id = a.documento_id
     where a.origem = 'upload_livre'
       and a.documento_id = p_chave::uuid
       and a.status <> 'assinada'
       and d.superado_em is null   -- rejeita versão obsoleta pós-contraproposta (CA12/RN16)
     for update;
  end if;

  -- No-op: já processado / inexistente / superado
  if v_doc is null then return; end if;

  -- REGRA DURA: a prova deve estar no Storage (RN11/CA6). Grava ANTES do status.
  if p_storage_path is null then
    raise exception 'prova assinada ausente — status NAO vira proposta_aprovada (RN11/CA6)';
  end if;

  -- Grava ponteiro do PDF assinado e manifesto de auditoria
  update public.documento_proposta
     set storage_path_assinado = p_storage_path,
         manifesto_auditoria   = case when p_origem = 'autentique' then p_evidencias
                                      else manifesto_auditoria end,
         updated_at = now()
   where id = v_doc;

  -- Atualiza assinatura
  update public.assinatura
     set status      = 'assinada',
         assinado_em = now(),
         evidencias  = p_evidencias,
         hash_sha256 = p_evidencias ->> 'hash_sha256',
         updated_at  = now()
   where documento_id = v_doc;

  -- Só então vira o status (guarda valida proposta_em_analise → proposta_aprovada)
  update public.projeto
     set status = 'proposta_aprovada', updated_at = now()
   where id = v_projeto and status = 'proposta_em_analise';

  -- Notifica host (proposta_assinada — RN24b) — fail-soft
  begin
    select host_coordenador_id into v_host from public.projeto where id = v_projeto;
    perform public.criar_notificacao(
      v_host, 'proposta_assinada',
      jsonb_build_object('projeto_id', v_projeto::text, 'documento_id', v_doc::text)
    );
  exception when others then null;
  end;
end; $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- C) contrapropor_proposta: representante; motivo; → aguardando_proposta
-- ══════════════════════════════════════════════════════════════════════════════
-- Valida: is_company_rep(empresa da dor) + motivo + estado proposta_em_analise.
-- Cancela assinatura + marca documento.superado_em (anti-upload obsoleto — CA12/RN16).
-- Conta rodadas → sinaliza alerta_negociacao em ≥3 (RN16b/CA14).
create or replace function public.contrapropor_proposta(
  p_projeto_id  uuid,
  p_motivo      text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid        uuid := (select auth.uid());
  v_empresa_id uuid;
  v_doc_id     uuid;
  v_rodadas    int;
begin
  -- Valida motivo
  if p_motivo is null or length(btrim(p_motivo)) = 0 then
    raise exception 'contraproposta exige motivo não vazio (CA11/RN14)';
  end if;

  -- Gate: estado proposta_em_analise
  if not exists (
    select 1 from public.projeto
    where id = p_projeto_id and status = 'proposta_em_analise' and deleted_at is null
  ) then
    raise exception 'contrapropor exige projeto em proposta_em_analise (CA11)';
  end if;

  -- Localiza empresa da dor
  select d.empresa_id into v_empresa_id
    from public.projeto pj
    join public.dor d on d.id = pj.dor_id
   where pj.id = p_projeto_id;

  -- Gate: representante da empresa (CA11)
  if not (select public.is_company_rep(v_empresa_id)) then
    raise exception 'contrapropor exige representante da empresa da dor (CA11)';
  end if;

  -- Localiza documento vigente (não superado)
  select id into v_doc_id
    from public.documento_proposta
   where projeto_id = p_projeto_id and superado_em is null and deleted_at is null
   order by created_at desc
   limit 1;

  if v_doc_id is null then
    raise exception 'documento de proposta vigente não encontrado';
  end if;

  -- Cancela a assinatura pendente (CA12)
  update public.assinatura
     set status = 'cancelada', updated_at = now()
   where documento_id = v_doc_id and status <> 'assinada';

  -- Marca documento como superado (anti-upload obsoleto — RN16)
  update public.documento_proposta
     set superado_em = now(), updated_at = now()
   where id = v_doc_id;

  -- Insere contraproposta
  insert into public.contraproposta
    (projeto_id, documento_id, motivo, criado_por)
  values
    (p_projeto_id, v_doc_id, btrim(p_motivo), v_uid);

  -- Conta rodadas e sinaliza alerta ≥3 (CA14/RN16b)
  update public.projeto
     set rodadas_contraproposta = rodadas_contraproposta + 1,
         alerta_negociacao = (rodadas_contraproposta + 1) >= 3,
         updated_at = now()
   where id = p_projeto_id
  returning rodadas_contraproposta into v_rodadas;

  -- UPDATE status → aguardando_proposta (guarda grava status_evento)
  update public.projeto
     set status = 'aguardando_proposta', updated_at = now()
   where id = p_projeto_id;

  -- Notifica host (contraproposta — RN24c) — fail-soft; motivo NÃO vai no payload público
  begin
    declare v_host uuid;
    begin
      select host_coordenador_id into v_host from public.projeto where id = p_projeto_id;
      perform public.criar_notificacao(
        v_host, 'contraproposta',
        jsonb_build_object('projeto_id', p_projeto_id::text)  -- sem motivo (CA21/RS17)
      );
    end;
  exception when others then null;
  end;
end; $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- D) iniciar_execucao: host; proposta_aprovada → em_execucao (RN18a/CA16)
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.iniciar_execucao(p_projeto_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_project_host(p_projeto_id)) then
    raise exception 'iniciar_execucao exige o host do projeto (CA16)';
  end if;
  if not exists (
    select 1 from public.projeto
    where id = p_projeto_id and status = 'proposta_aprovada' and deleted_at is null
  ) then
    raise exception 'iniciar_execucao exige projeto em proposta_aprovada (CA16)';
  end if;
  -- Guarda valida proposta_aprovada → em_execucao e grava status_evento
  update public.projeto
     set status = 'em_execucao', updated_at = now()
   where id = p_projeto_id;
end; $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- E) finalizar_projeto: host; em_execucao → finalizado (RN18b/CA17)
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.finalizar_projeto(p_projeto_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_project_host(p_projeto_id)) then
    raise exception 'finalizar_projeto exige o host do projeto (CA17)';
  end if;
  if not exists (
    select 1 from public.projeto
    where id = p_projeto_id and status = 'em_execucao' and deleted_at is null
  ) then
    raise exception 'finalizar_projeto exige projeto em em_execucao — pular etapa é negado (CA17)';
  end if;
  -- Guarda valida em_execucao → finalizado e grava status_evento
  update public.projeto
     set status = 'finalizado', updated_at = now()
   where id = p_projeto_id;
end; $$;

-- ── Grants provisórios (hardening completo na 0072) ──────────────────────────
-- Lição 0063: CREATE OR REPLACE reseta para PUBLIC — re-afirmar sempre.
revoke all on function public.enviar_proposta(uuid, text, public.origem_assinatura)             from public, anon;
revoke all on function public.confirmar_assinatura(public.origem_assinatura, text, text, jsonb) from public, anon;
revoke all on function public.contrapropor_proposta(uuid, text)                                  from public, anon;
revoke all on function public.iniciar_execucao(uuid)                                             from public, anon;
revoke all on function public.finalizar_projeto(uuid)                                            from public, anon;

grant execute on function public.enviar_proposta(uuid, text, public.origem_assinatura)              to authenticated;
grant execute on function public.confirmar_assinatura(public.origem_assinatura, text, text, jsonb)  to authenticated, service_role;
grant execute on function public.contrapropor_proposta(uuid, text)                                   to authenticated;
grant execute on function public.iniciar_execucao(uuid)                                              to authenticated;
grant execute on function public.finalizar_projeto(uuid)                                             to authenticated;
