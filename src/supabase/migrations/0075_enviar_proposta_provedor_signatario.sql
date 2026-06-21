-- 0075 — Corrige o Caminho A (Autentique) ponta-a-ponta (descoberto em produção via logs)
--
-- Bugs de integração (o seam action↔RPC↔tabela nunca foi testado e2e):
--   1) A Server Action chamava enviar_proposta com `p_provedor_doc_id`, mas a RPC tinha
--      `p_origem` → PostgREST 404 (PGRST202) → erro genérico no app.
--   2) provedor_doc_id NUNCA era persistido → o webhook (confirmar_assinatura autentique)
--      casa por `provedor_doc_id` → nunca selava a proposta.
--   3) assinatura NÃO tinha coluna `link_assinatura`, mas o adapter `lerDadosProposta`
--      faz select dela → a leitura quebrava após o envio.
--   4) o e-mail do representante não era buscado → Autentique criava doc sem signatário.
--
-- Esta migração:
--   A) ALTER assinatura ADD link_assinatura (corrige #3).
--   B) Recria enviar_proposta com p_provedor_doc_id + p_link_assinatura (corrige #1/#2);
--      status='enviada' quando há provedor (Caminho A enviado ao provedor), senão 'pendente'.
--   C) Cria obter_signatario_proposta(projeto) → {nome,email} do representante da empresa
--      (host/admin only) para a action montar o pedido no Autentique (corrige #4).
--
-- Depende de: 0066 (assinatura), 0074 (enviar_proposta vigente), 0004 (is_admin),
--             0031 (is_project_host). Re-afirma grants (lição 0063).
-- Rollback: drop function obter_signatario_proposta; recriar enviar_proposta 3-arg da 0074;
--           alter table assinatura drop column link_assinatura.

-- A) coluna do link de assinatura (Caminho A) — nullable (Autentique envia convite por e-mail;
--    o link in-app é populado quando o provedor o fornece, ex.: gateway Fake/local).
alter table public.assinatura add column if not exists link_assinatura text;

-- B) enviar_proposta com persistência de provedor_doc_id + link + status
drop function if exists public.enviar_proposta(uuid, text, public.origem_assinatura);

create or replace function public.enviar_proposta(
  p_projeto_id      uuid,
  p_storage_path    text,
  p_origem          public.origem_assinatura,
  p_provedor_doc_id text default null,
  p_link_assinatura text default null
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

  insert into public.assinatura (documento_id, origem, signatario_id, status, provedor_doc_id, link_assinatura)
  values (
    v_doc_id, p_origem, v_rep_id,
    case when p_provedor_doc_id is not null then 'enviada'::public.status_assinatura
         else 'pendente'::public.status_assinatura end,
    p_provedor_doc_id, p_link_assinatura
  );

  update public.projeto set status = 'proposta_em_analise', updated_at = now()
   where id = p_projeto_id;
  -- notificação: trigger _assinatura_notificar_envio (0073)
end; $$;

revoke all     on function public.enviar_proposta(uuid, text, public.origem_assinatura, text, text) from public, anon;
grant  execute on function public.enviar_proposta(uuid, text, public.origem_assinatura, text, text) to authenticated;

-- C) obter_signatario_proposta — representante da empresa do projeto (host/admin only)
create or replace function public.obter_signatario_proposta(p_projeto_id uuid)
returns table(nome text, email text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_empresa_id uuid;
begin
  if not (select public.is_project_host(p_projeto_id)) and not (select public.is_admin()) then
    raise exception 'apenas host/admin podem obter o signatário (RN18)';
  end if;

  select d.empresa_id into v_empresa_id
    from public.projeto pj join public.dor d on d.id = pj.dor_id
   where pj.id = p_projeto_id;

  return query
    select coalesce(pf.nome_publico, '')::text as nome, u.email::text as email
      from public.membro_empresa me
      join auth.users u on u.id = me.user_id
      left join public.perfil pf on pf.user_id = me.user_id
     where me.empresa_id = v_empresa_id
       and not exists (select 1 from public.admin_app aa where aa.user_id = me.user_id)
     limit 1;
end; $$;

revoke all     on function public.obter_signatario_proposta(uuid) from public, anon;
grant  execute on function public.obter_signatario_proposta(uuid) to authenticated;
