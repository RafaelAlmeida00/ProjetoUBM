-- 0077 — Signatário da proposta = o representante CERTO (descoberto em prod)
--
-- Bug: enviar_proposta e obter_signatario_proposta escolhiam o signatário com
-- `select ... from membro_empresa where empresa_id=X and not admin LIMIT 1` — SEM ordenar e
-- SEM olhar o papel de sistema. Empresas de teste têm vários membro_empresa (todos com
-- membro_empresa.papel='representante'), então o LIMIT 1 pegava o MAIS ANTIGO — que no caso
-- era a conta do HOST/coordenador, não o representante. O Autentique então enviou o convite
-- para o e-mail errado.
--
-- Correção: o signatário é o AUTOR DA DOR (o representante que levantou a dor), se for membro
-- não-admin da empresa. Fallbacks determinísticos: membro com papel_usuario.role='representante';
-- senão qualquer membro não-admin (compat). Helper _signatario_proposta garante que enviar e
-- obter escolham o MESMO usuário.
--
-- Depende de: 0075 (enviar_proposta 5-arg + obter_signatario_proposta), 0004 (is_admin),
--             0031 (is_project_host). Re-afirma grants (lição 0063).
-- Rollback: re-aplicar enviar_proposta/obter_signatario_proposta da 0075 (seleção LIMIT 1).

-- Helper: resolve o user_id do signatário (representante) de um projeto.
create or replace function public._signatario_proposta(p_projeto_id uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  v_empresa_id uuid;
  v_autor_id   uuid;
  v_rep_id     uuid;
begin
  select d.empresa_id, d.autor_id into v_empresa_id, v_autor_id
    from public.projeto pj join public.dor d on d.id = pj.dor_id
   where pj.id = p_projeto_id;

  -- 1) Preferir o AUTOR da dor (membro não-admin da empresa).
  select me.user_id into v_rep_id
    from public.membro_empresa me
   where me.empresa_id = v_empresa_id and me.user_id = v_autor_id
     and not exists (select 1 from public.admin_app aa where aa.user_id = me.user_id)
   limit 1;

  -- 2) Fallback: membro não-admin com papel de sistema 'representante' (determinístico).
  if v_rep_id is null then
    select me.user_id into v_rep_id
      from public.membro_empresa me
     where me.empresa_id = v_empresa_id
       and not exists (select 1 from public.admin_app aa where aa.user_id = me.user_id)
       and exists (select 1 from public.papel_usuario pu where pu.user_id = me.user_id and pu.role = 'representante')
     order by me.created_at desc
     limit 1;
  end if;

  -- 3) Fallback: qualquer membro não-admin (compat) — determinístico por created_at.
  if v_rep_id is null then
    select me.user_id into v_rep_id
      from public.membro_empresa me
     where me.empresa_id = v_empresa_id
       and not exists (select 1 from public.admin_app aa where aa.user_id = me.user_id)
     order by me.created_at
     limit 1;
  end if;

  return v_rep_id;
end; $$;

revoke all     on function public._signatario_proposta(uuid) from public, anon;
grant  execute on function public._signatario_proposta(uuid) to authenticated, service_role;

-- enviar_proposta — usa o helper para o signatário.
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

  v_rep_id := public._signatario_proposta(p_projeto_id);
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
end; $$;

revoke all     on function public.enviar_proposta(uuid, text, public.origem_assinatura, text, text) from public, anon;
grant  execute on function public.enviar_proposta(uuid, text, public.origem_assinatura, text, text) to authenticated;

-- obter_signatario_proposta — usa o MESMO helper (e-mail consistente com o que enviar_proposta grava).
create or replace function public.obter_signatario_proposta(p_projeto_id uuid)
returns table(nome text, email text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_rep_id uuid;
begin
  if not (select public.is_project_host(p_projeto_id)) and not (select public.is_admin()) then
    raise exception 'apenas host/admin podem obter o signatário (RN18)';
  end if;

  v_rep_id := public._signatario_proposta(p_projeto_id);

  return query
    select coalesce(pf.nome_publico, '')::text as nome, u.email::text as email
      from auth.users u
      left join public.perfil pf on pf.user_id = u.id
     where u.id = v_rep_id;
end; $$;

revoke all     on function public.obter_signatario_proposta(uuid) from public, anon;
grant  execute on function public.obter_signatario_proposta(uuid) to authenticated;
