-- 0059 — Título do projeto (entra na proposta da dor, pelo representante)
-- Por quê: projetos precisam de uma identidade VISUAL ("Título - Empresa"); o id continua sendo a
-- identidade lógica. O título é digitado pelo representante ao propor a dor (decisão de produto) e
-- acompanha o projeto criado pelo trigger. Coluna em `dor` (projeto 1:1 dor via uq_projeto_dor).
-- Nullable + CHECK não-vazio: dores legadas ficam sem título e a UI cai no fallback (só empresa).
--
-- As 3 RPCs de entrada/edição de dor ganham p_titulo (DEFAULT null) → exigem DROP+CREATE (muda a
-- assinatura). Re-grant ao final (DROP/CREATE resetam EXECUTE — memória do projeto).
-- Rollback: drop column dor.titulo + recriar as RPCs sem p_titulo (0049/0040).

alter table public.dor add column if not exists titulo text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'dor_titulo_nao_vazio') then
    alter table public.dor add constraint dor_titulo_nao_vazio
      check (titulo is null or btrim(titulo) <> '');
  end if;
end $$;

-- ── criar_dor (representante logado → rascunho) ──
drop function if exists public.criar_dor(uuid, text, boolean, text, timestamptz, curso_ubm[]);
create function public.criar_dor(
  p_empresa_id uuid, p_descricao text, p_consentimento boolean,
  p_consent_version text, p_consent_at timestamptz,
  p_cursos curso_ubm[] default null, p_titulo text default null
)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid    uuid := (select auth.uid());
  v_dor_id uuid;
begin
  if v_uid is null then raise exception 'sessao necessaria para criar dor'; end if;
  if not exists (select 1 from public.papel_usuario pu where pu.user_id = v_uid and pu.role = 'representante') then
    raise exception 'permissao: usuario nao e representante';
  end if;
  if not (select public.esta_verificado()) then
    raise exception 'permissao: conta nao verificada (RN19)';
  end if;
  if not exists (select 1 from public.membro_empresa me where me.user_id = v_uid and me.empresa_id = p_empresa_id and me.papel = 'representante') then
    raise exception 'empresa: usuario nao e representante desta empresa';
  end if;
  if not coalesce(p_consentimento, false) or p_consent_version is null then
    raise exception 'consentimento LGPD obrigatorio (RN7)';
  end if;
  if p_descricao is null or length(btrim(p_descricao)) = 0 then
    raise exception 'descricao nao pode ser vazia';
  end if;
  insert into public.dor (
    autor_id, empresa_id, status_dor, descricao, titulo,
    rep_nome, departamento, cargo,
    consentimento, consent_version, consent_at, created_by
  )
  select
    v_uid, p_empresa_id, 'rascunho', p_descricao, nullif(btrim(coalesce(p_titulo, '')), ''),
    coalesce((select p.nome_publico from public.perfil p where p.user_id = v_uid), ''),
    me.departamento, me.cargo,
    p_consentimento, p_consent_version, p_consent_at, v_uid
  from public.membro_empresa me
  where me.user_id = v_uid and me.empresa_id = p_empresa_id
  returning id into v_dor_id;
  if p_cursos is not null then
    insert into public.dor_curso (dor_id, curso)
    select v_dor_id, c from unnest(p_cursos) as c on conflict (dor_id, curso) do nothing;
  end if;
  return v_dor_id;
end;
$function$;

-- ── editar_dor (autor edita rascunho/rejeitada/em_moderacao/publicada) ──
drop function if exists public.editar_dor(uuid, text, curso_ubm[]);
create function public.editar_dor(
  p_dor_id uuid, p_descricao text, p_cursos curso_ubm[] default null, p_titulo text default null
)
returns void language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_dor record;
  v_campos text[] := '{}';
  v_re_moderar boolean := false;
  v_novo_titulo text;
begin
  if v_uid is null then raise exception 'sessao necessaria para editar dor'; end if;
  select id, autor_id, status_dor, descricao, titulo, aprovado_por, publicada_em
    into v_dor from public.dor where id = p_dor_id and deleted_at is null;
  if not found then raise exception 'dor nao encontrada'; end if;
  if v_dor.autor_id <> v_uid then
    raise exception 'permissao: apenas o autor dono pode editar sua dor (RS-ED1)';
  end if;
  if not (select public.esta_verificado()) then
    raise exception 'permissao: conta nao verificada (RS-ED5/RN19)';
  end if;
  if v_dor.status_dor not in ('rascunho', 'rejeitada', 'em_moderacao', 'publicada') then
    raise exception 'permissao: dor nao editavel no status atual';
  end if;
  if p_descricao is null or length(btrim(p_descricao)) = 0 then
    raise exception 'descricao nao pode ser vazia';
  end if;
  v_novo_titulo := case when p_titulo is not null then nullif(btrim(p_titulo), '') else v_dor.titulo end;
  if p_descricao <> v_dor.descricao then v_campos := array_append(v_campos, 'descricao'); end if;
  if p_cursos is not null then v_campos := array_append(v_campos, 'cursos'); end if;
  if p_titulo is not null and v_novo_titulo is distinct from v_dor.titulo then
    v_campos := array_append(v_campos, 'titulo');
  end if;
  v_re_moderar := v_dor.status_dor in ('publicada', 'em_moderacao');
  if v_re_moderar then
    update public.dor set descricao = p_descricao, titulo = v_novo_titulo, status_dor = 'em_moderacao',
      aprovado_por = null, aprovado_em = null, publicada_em = null, updated_at = now()
     where id = p_dor_id;
  else
    update public.dor set descricao = p_descricao, titulo = v_novo_titulo, updated_at = now() where id = p_dor_id;
  end if;
  if p_cursos is not null then
    delete from public.dor_curso where dor_id = p_dor_id;
    insert into public.dor_curso (dor_id, curso)
    select p_dor_id, c from unnest(p_cursos) as c on conflict (dor_id, curso) do nothing;
  end if;
  perform public._dor_log(p_dor_id, 'editada'::public.dor_evento_tipo,
    jsonb_build_object('campos', to_jsonb(v_campos)));
  if v_dor.status_dor = 'publicada' then
    perform public._dor_log(p_dor_id, 'reenviada_moderacao'::public.dor_evento_tipo);
  end if;
end;
$function$;

-- ── submeter_dor_landing (landing logada + anônima) ──
drop function if exists public.submeter_dor_landing(uuid, text, text, text, text, boolean, text, timestamptz, curso_ubm[], text, text);
create function public.submeter_dor_landing(
  p_empresa_id uuid, p_descricao text, p_rep_nome text, p_departamento text, p_cargo text,
  p_consentimento boolean, p_consent_version text, p_consent_at timestamptz,
  p_cursos curso_ubm[] default null, p_email text default null, p_empresa_nome text default null,
  p_titulo text default null
)
returns table(out_dor_id uuid, out_claim_token text)
language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid    uuid := (select auth.uid());
  v_email  text;
  v_dor_id uuid;
  v_token  text;
  v_titulo text := nullif(btrim(coalesce(p_titulo, '')), '');
begin
  if length(btrim(coalesce(p_descricao, ''))) > 5000 then raise exception 'descricao excede limite de 5000 caracteres (SR-A7)'; end if;
  if length(btrim(coalesce(p_rep_nome, ''))) > 200 then raise exception 'rep_nome excede limite de 200 caracteres (SR-A7)'; end if;
  if length(btrim(coalesce(p_departamento, ''))) > 200 then raise exception 'departamento excede limite de 200 caracteres (SR-A7)'; end if;
  if length(btrim(coalesce(p_cargo, ''))) > 200 then raise exception 'cargo excede limite de 200 caracteres (SR-A7)'; end if;
  if length(btrim(coalesce(p_titulo, ''))) > 160 then raise exception 'titulo excede limite de 160 caracteres'; end if;
  if not coalesce(p_consentimento, false) or p_consent_version is null then raise exception 'consentimento LGPD obrigatorio (RN7/SR-A9)'; end if;
  if p_descricao is null or length(btrim(p_descricao)) = 0 then raise exception 'descricao nao pode ser vazia'; end if;

  if v_uid is not null then
    v_email := (select auth.jwt() ->> 'email');
    if not (select public.is_email_corporativo(v_email)) then raise exception 'representante exige e-mail corporativo (RN23/CA23)'; end if;
    if p_empresa_id is null then raise exception 'empresa_id obrigatorio (RN6)'; end if;
    insert into public.dor (
      autor_id, empresa_id, status_dor, descricao, titulo,
      rep_nome, departamento, cargo, consentimento, consent_version, consent_at, created_by
    ) values (
      v_uid, p_empresa_id, 'em_moderacao', p_descricao, v_titulo,
      coalesce(p_rep_nome, ''), p_departamento, p_cargo, p_consentimento, p_consent_version, p_consent_at, v_uid
    ) returning id into v_dor_id;
    return query select v_dor_id out_dor_id, null::text out_claim_token;
  else
    if p_email is null or length(btrim(p_email)) = 0 then raise exception 'email obrigatorio no ramo anonimo (SR-A8)'; end if;
    v_email := lower(btrim(p_email));
    if not (select public.is_email_corporativo(v_email)) then raise exception 'representante exige e-mail corporativo (RN23/CA23/SR-A8)'; end if;
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    insert into public.dor (
      autor_id, empresa_id, status_dor, descricao, titulo,
      rep_nome, departamento, cargo, consentimento, consent_version, consent_at,
      claim_email, claim_token_hash, claim_token_expires_at, created_by
    ) values (
      null, p_empresa_id, 'em_moderacao', p_descricao, v_titulo,
      coalesce(p_rep_nome, ''), p_departamento, p_cargo, p_consentimento, p_consent_version, p_consent_at,
      v_email, sha256(convert_to(v_token, 'UTF8')), now() + interval '24 hours', null
    ) returning id into v_dor_id;
    return query select v_dor_id out_dor_id, v_token out_claim_token;
  end if;

  if p_cursos is not null then
    insert into public.dor_curso (dor_id, curso)
    select v_dor_id, c from unnest(p_cursos) as c on conflict (dor_id, curso) do nothing;
  end if;
end;
$function$;

-- Re-hardening de grants (DROP/CREATE resetam EXECUTE).
revoke all on function public.criar_dor(uuid, text, boolean, text, timestamptz, curso_ubm[], text) from public;
revoke all on function public.editar_dor(uuid, text, curso_ubm[], text) from public;
revoke all on function public.submeter_dor_landing(uuid, text, text, text, text, boolean, text, timestamptz, curso_ubm[], text, text, text) from public;
grant execute on function public.criar_dor(uuid, text, boolean, text, timestamptz, curso_ubm[], text) to authenticated;
grant execute on function public.editar_dor(uuid, text, curso_ubm[], text) to authenticated;
grant execute on function public.submeter_dor_landing(uuid, text, text, text, text, boolean, text, timestamptz, curso_ubm[], text, text, text) to anon, authenticated;
-- IMPORTANTE: o Supabase hospedado concede anon em função NOVA via default privileges; revoke from
-- public NÃO remove o grant de anon. criar_dor/editar_dor são authenticated-only → revoke anon explícito.
revoke execute on function public.criar_dor(uuid, text, boolean, text, timestamptz, curso_ubm[], text) from anon;
revoke execute on function public.editar_dor(uuid, text, curso_ubm[], text) from anon;
