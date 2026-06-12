-- Migração 0049 — criar_dor / editar_dor (feature 004 delta 3)
-- spec.md RN4, RN5, RN7, RN8, RN19
-- security.md RS-D1/RS-D2; architecture.md §2.2/§2.7
-- Depende de: 0015 (dor/status_dor), 0016 (dor_curso), 0003 (membro_empresa/papel_usuario),
--             0004 (esta_verificado/has_role), 0027 (membro_empresa.departamento/cargo),
--             0023/0038/0048 (padrão revoke execute from public)
--
-- Ordem:
--   (1) criar_dor — cria rascunho vinculada à empresa (representante verificado)
--   (2) editar_dor — atualiza conteúdo (só autor em rascunho/rejeitada)
--   (3) hardening: revoke/grant

-- ═══════════════════════════════════════════════════════════════════════════════
-- (1) criar_dor — representante verificado cria dor em rascunho
-- ═══════════════════════════════════════════════════════════════════════════════
-- Gate RN19: exige papel 'representante' + conta verificada + vínculo membro_empresa
--            com a empresa-alvo (RN4/RN6). Consentimento obrigatório (RN7).
-- Dor nasce com status_dor='rascunho' e autor_id=auth.uid().
-- Cursos (RN8): inseridos com dedup via ON CONFLICT DO NOTHING.
create or replace function public.criar_dor(
  p_empresa_id      uuid,
  p_descricao       text,
  p_consentimento   boolean,
  p_consent_version text,
  p_consent_at      timestamptz,
  p_cursos          public.curso_ubm[] default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_dor_id uuid;
begin
  -- Guarda 1: sessão obrigatória (RN19)
  if v_uid is null then
    raise exception 'sessao necessaria para criar dor';
  end if;

  -- Guarda 2: papel representante (RN19)
  if not exists (
    select 1 from public.papel_usuario pu
     where pu.user_id = v_uid
       and pu.role = 'representante'
  ) then
    raise exception 'permissao: usuario nao e representante';
  end if;

  -- Guarda 3: conta verificada (RN19 / gate esta_verificado)
  if not (select public.esta_verificado()) then
    raise exception 'permissao: conta nao verificada (RN19)';
  end if;

  -- Guarda 4: vínculo representante↔empresa (RN4/RN6 — anti-spoofing de empresa)
  if not exists (
    select 1 from public.membro_empresa me
     where me.user_id = v_uid
       and me.empresa_id = p_empresa_id
       and me.papel = 'representante'
  ) then
    raise exception 'empresa: usuario nao e representante desta empresa';
  end if;

  -- Guarda 5: consentimento LGPD (RN7)
  if not coalesce(p_consentimento, false) or p_consent_version is null then
    raise exception 'consentimento LGPD obrigatorio (RN7)';
  end if;

  -- Guarda 6: descrição não-vazia
  if p_descricao is null or length(btrim(p_descricao)) = 0 then
    raise exception 'descricao nao pode ser vazia';
  end if;

  -- Insere dor com status rascunho (RN5)
  -- rep_nome, departamento, cargo: lidos do membro_empresa (opcional — podem ser null)
  insert into public.dor (
    autor_id, empresa_id, status_dor, descricao,
    rep_nome, departamento, cargo,
    consentimento, consent_version, consent_at,
    created_by
  )
  select
    v_uid,
    p_empresa_id,
    'rascunho',
    p_descricao,
    coalesce((select p.nome_publico from public.perfil p where p.user_id = v_uid), ''),
    me.departamento,
    me.cargo,
    p_consentimento,
    p_consent_version,
    p_consent_at,
    v_uid
  from public.membro_empresa me
  where me.user_id = v_uid and me.empresa_id = p_empresa_id
  returning id into v_dor_id;

  -- Associa cursos (RN8 — dedup via ON CONFLICT DO NOTHING)
  if p_cursos is not null then
    insert into public.dor_curso (dor_id, curso)
    select v_dor_id, c
      from unnest(p_cursos) as c
    on conflict (dor_id, curso) do nothing;
  end if;

  return v_dor_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (2) editar_dor — autor atualiza conteúdo (rascunho/rejeitada apenas — RN5)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Guarda de autoria: dor.autor_id = auth.uid() (RN5).
-- Guarda de estado: status_dor in ('rascunho','rejeitada') (RN5).
-- Cursos: se p_cursos não-nulo, substitui o conjunto (delete+insert dedup — RN8).
create or replace function public.editar_dor(
  p_dor_id    uuid,
  p_descricao text,
  p_cursos    public.curso_ubm[] default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_dor record;
begin
  -- Guarda 1: sessão obrigatória
  if v_uid is null then
    raise exception 'sessao necessaria para editar dor';
  end if;

  -- Carrega a dor (para checar autoria + estado)
  select id, autor_id, status_dor
    into v_dor
    from public.dor
   where id = p_dor_id
     and deleted_at is null;

  if not found then
    raise exception 'dor nao encontrada';
  end if;

  -- Guarda 2: autoria + estado editável (RN5)
  if v_dor.autor_id <> v_uid
     or v_dor.status_dor not in ('rascunho', 'rejeitada')
  then
    raise exception 'permissao: dor nao editavel (somente autor em rascunho/rejeitada — RN5)';
  end if;

  -- Guarda 3: descrição não-vazia (se fornecida)
  if p_descricao is null or length(btrim(p_descricao)) = 0 then
    raise exception 'descricao nao pode ser vazia';
  end if;

  -- Atualiza descrição
  update public.dor
     set descricao  = p_descricao,
         updated_at = now()
   where id = p_dor_id;

  -- Substitui cursos (RN8 — se p_cursos fornecido, delete+insert dedup)
  if p_cursos is not null then
    delete from public.dor_curso where dor_id = p_dor_id;
    insert into public.dor_curso (dor_id, curso)
    select p_dor_id, c
      from unnest(p_cursos) as c
    on conflict (dor_id, curso) do nothing;
  end if;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (3) Hardening: revoke PUBLIC + grant authenticated apenas (padrão 0023/0038/0048)
-- ═══════════════════════════════════════════════════════════════════════════════
-- criar_dor: só authenticated; anon NUNCA executa (guarda interna v_uid is null também cobre)
-- Assinatura: (uuid, text, boolean, text, timestamptz, curso_ubm[] default null)
revoke execute on function public.criar_dor(uuid, text, boolean, text, timestamptz, public.curso_ubm[]) from public;
revoke execute on function public.criar_dor(uuid, text, boolean, text, timestamptz, public.curso_ubm[]) from anon;
grant  execute on function public.criar_dor(uuid, text, boolean, text, timestamptz, public.curso_ubm[]) to authenticated;

-- editar_dor: só authenticated; anon NUNCA executa
revoke execute on function public.editar_dor(uuid, text, public.curso_ubm[]) from public;
revoke execute on function public.editar_dor(uuid, text, public.curso_ubm[]) from anon;
grant  execute on function public.editar_dor(uuid, text, public.curso_ubm[]) to authenticated;
