-- Migração 0042 — claim-token one-shot + e-mail corporativo de contato (Delta 2 — 2026-06-11)
-- architecture.md §Delta 2 F.0–F.11 · tasks.md §TASKS-delta-2 T-B1..T-B6
-- security.md §Delta 2 SR-B1..SR-B15 + VETO-B2 + A-MENOR-01 DURO
-- ADR-004F (prova de posse por token, contato corporativo, login livre)
--
-- Depende de: 0040 (claim_email, autor_id nullable, submeter_dor_landing 11-arg),
--             0041 (reclamar_dor(uuid,uuid) overload),
--             0027 (onboarding_representante 4-arg, erasure_titular),
--             0006 (padrão token-hash reusado),
--             0007 (is_email_corporativo),
--             0008 (audit)
--
-- Ordem interna (F.8):
--   (1) dor.claim_token_hash bytea + claim_token_expires_at timestamptz
--   (2) índice parcial em claim_token_hash (órfãs vivas)
--   (2b) membro_empresa.email_corporativo text (contato representante)
--   (3) submeter_dor_landing v3 → returns table(dor_id, claim_token) + gera token
--   (4) re-grant cirúrgico
--   (5) drop reclamar_dor(uuid,uuid) overload da 0041
--   (6) reclamar_dor v3 → (p_dor_id, p_token, p_empresa_id default null)
--   (7) drop onboarding_representante 4-arg da 0027
--   (8) onboarding_representante v2 → +p_email_corporativo
--   (9) erasure_titular estendida (token + email_contato)
--   (10) expurgar_dores_orfas_expiradas estendida (token)

-- ═══════════════════════════════════════════════════════════════════════════════
-- (1) dor.claim_token_hash + claim_token_expires_at (SR-B2/SR-B7)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Token hasheado (sha256) — nunca em claro na tabela (SR-B2).
-- Expiração de 24h (SR-B7); null p/ dores legadas ou reclamadas.
alter table public.dor add column if not exists claim_token_hash bytea;
alter table public.dor add column if not exists claim_token_expires_at timestamptz;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (2) Índice parcial em claim_token_hash para match rápido (SR-B2)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Só indexa órfãs vivas (autor_id is null + não deletadas) — perf.
create index if not exists dor_claim_token_hash_orfa_idx
  on public.dor (claim_token_hash)
  where autor_id is null and deleted_at is null;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (2b) membro_empresa.email_corporativo — contato do representante (SR-B13)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Herda RLS own+admin da 0005 — nenhuma policy nova.
-- LGPD: PII de contato (A-MENOR-01 DURO — SR-B14).
alter table public.membro_empresa add column if not exists email_corporativo text;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (3) submeter_dor_landing v3 → returns table(dor_id uuid, claim_token text) (F.5)
-- ═══════════════════════════════════════════════════════════════════════════════
-- RAMO ANON: gera token one-shot, grava hash+TTL, retorna token em claro 1× (SR-B3).
-- RAMO LOGADO: comportamento intacto (autor_id=uid, sem token; retorna claim_token=null).
-- todos os gates de conteúdo da 0040 preservados.
drop function if exists public.submeter_dor_landing(uuid, text, text, text, text, boolean, text, timestamptz, public.curso_ubm[], text, text);

create or replace function public.submeter_dor_landing(
  p_empresa_id      uuid,
  p_descricao       text,
  p_rep_nome        text,
  p_departamento    text,
  p_cargo           text,
  p_consentimento   boolean,
  p_consent_version text,
  p_consent_at      timestamptz,
  p_cursos          public.curso_ubm[] default null,
  p_email           text              default null,
  p_empresa_nome    text              default null
) returns table(out_dor_id uuid, out_claim_token text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_email  text;
  v_dor_id uuid;
  v_token  text;
begin
  -- ── Tetos de payload (SR-A7 — invariante de banco) ───────────────────────
  if length(btrim(coalesce(p_descricao, ''))) > 5000 then
    raise exception 'descricao excede limite de 5000 caracteres (SR-A7)';
  end if;
  if length(btrim(coalesce(p_rep_nome, ''))) > 200 then
    raise exception 'rep_nome excede limite de 200 caracteres (SR-A7)';
  end if;
  if length(btrim(coalesce(p_departamento, ''))) > 200 then
    raise exception 'departamento excede limite de 200 caracteres (SR-A7)';
  end if;
  if length(btrim(coalesce(p_cargo, ''))) > 200 then
    raise exception 'cargo excede limite de 200 caracteres (SR-A7)';
  end if;

  -- ── Guarda de consentimento (SR-A9) ──────────────────────────────────────
  if not coalesce(p_consentimento, false) or p_consent_version is null then
    raise exception 'consentimento LGPD obrigatorio (RN7/SR-A9)';
  end if;

  -- ── Guarda de descrição não-vazia ────────────────────────────────────────
  if p_descricao is null or length(btrim(p_descricao)) = 0 then
    raise exception 'descricao nao pode ser vazia';
  end if;

  -- ══ RAMO DE AUTORIDADE (fail-closed) ═════════════════════════════════════

  if v_uid is not null then
    -- ── Ramo LOGADO (comportamento legado — compat intacta) ────────────────
    v_email := (select auth.jwt() ->> 'email');

    if not (select public.is_email_corporativo(v_email)) then
      raise exception 'representante exige e-mail corporativo (RN23/CA23)';
    end if;

    if p_empresa_id is null then
      raise exception 'empresa_id obrigatorio (RN6)';
    end if;

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

    -- Ramo logado: sem token, retorna out_claim_token = null
    return query select v_dor_id out_dor_id, null::text out_claim_token;

  else
    -- ── Ramo ANÔNIMO (caminho novo — SR-A1/SR-B1) ─────────────────────────
    if p_email is null or length(btrim(p_email)) = 0 then
      raise exception 'email obrigatorio no ramo anonimo (SR-A8)';
    end if;

    v_email := lower(btrim(p_email));

    if not (select public.is_email_corporativo(v_email)) then
      raise exception 'representante exige e-mail corporativo (RN23/CA23/SR-A8)';
    end if;

    -- Gera token one-shot (padrão 0006 — ≥128b de entropia)
    v_token := replace(gen_random_uuid()::text, '-', '')
            || replace(gen_random_uuid()::text, '-', '');

    insert into public.dor (
      autor_id, empresa_id, status_dor, descricao,
      rep_nome, departamento, cargo,
      consentimento, consent_version, consent_at,
      claim_email,
      claim_token_hash, claim_token_expires_at,
      created_by
    ) values (
      null, p_empresa_id, 'em_moderacao', p_descricao,
      coalesce(p_rep_nome, ''), p_departamento, p_cargo,
      p_consentimento, p_consent_version, p_consent_at,
      v_email,
      sha256(convert_to(v_token, 'UTF8')),
      now() + interval '24 hours',
      null
    ) returning id into v_dor_id;

    -- Retorna token em claro UMA vez (SR-B3)
    return query select v_dor_id out_dor_id, v_token out_claim_token;

  end if;

  -- ── Associa cursos (ambos os ramos) ─────────────────────────────────────
  if p_cursos is not null then
    insert into public.dor_curso (dor_id, curso)
    select v_dor_id, c
      from unnest(p_cursos) as c
    on conflict (dor_id, curso) do nothing;
  end if;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (4) Re-grant cirúrgico em submeter_dor_landing v3 (SR-B12)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Nova assinatura table-returning exige re-grant (drop+create).
-- A matriz 0028/0040 permanece intacta; anon só executa esta (SR-A-H1/H2).
revoke execute on function public.submeter_dor_landing(uuid, text, text, text, text, boolean, text, timestamptz, public.curso_ubm[], text, text) from public;
grant  execute on function public.submeter_dor_landing(uuid, text, text, text, text, boolean, text, timestamptz, public.curso_ubm[], text, text) to anon;
grant  execute on function public.submeter_dor_landing(uuid, text, text, text, text, boolean, text, timestamptz, public.curso_ubm[], text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (5) Drop do overload reclamar_dor(uuid, uuid) da 0041
-- ═══════════════════════════════════════════════════════════════════════════════
-- Assinatura de 2 params da 0041 não pode coexistir com a nova (3 params,
-- p_token text obrigatório + p_empresa_id default null — Postgres resolveria
-- chamadas de 2 args como ambíguas).
drop function if exists public.reclamar_dor(uuid, uuid);

-- ═══════════════════════════════════════════════════════════════════════════════
-- (6) reclamar_dor v3: (p_dor_id, p_token, p_empresa_id default null) (F.5)
-- ═══════════════════════════════════════════════════════════════════════════════
-- A única mudança lógica vs. 0041: a prova de posse MIGRA de igualdade de e-mail
-- para match de hash one-shot (SR-B4/SR-B5). Preservado: guarda de sessão,
-- idempotência, empresa diferida, onboarding_representante v2.
-- REMOVIDO: is_email_corporativo(jwt.email) — o login é livre (F.5).
create or replace function public.reclamar_dor(
  p_dor_id     uuid,
  p_token      text,
  p_empresa_id uuid default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_dor        record;
  v_empresa_id uuid;
begin
  -- ── Passo 1: guarda de sessão (nunca anon — SR-A-H3) ─────────────────────
  if v_uid is null then
    raise exception 'sessao necessaria para reclamar dor (claim requer login)';
  end if;

  -- ── Passo 2: carrega a dor (não deletada) ────────────────────────────────
  select id, claim_email, empresa_id, rep_nome, departamento, cargo, autor_id,
         claim_token_hash, claim_token_expires_at
    into v_dor
    from public.dor
   where id = p_dor_id
     and deleted_at is null;

  if not found then
    raise exception 'dor nao encontrada ou ja deletada';
  end if;

  -- ── Passo 7 (idempotência): re-claim pelo mesmo uid = no-op ──────────────
  if v_dor.autor_id = v_uid then
    return;
  end if;

  -- ── Passo 3: prova de posse por TOKEN (SR-B4 [DURO]) ─────────────────────
  -- A igualdade de e-mail foi SUBSTITUÍDA pelo match de hash (F.5).
  -- Três situações de falha (fail-closed):

  -- (a) Token nulo ou vazio → raise (T-B01)
  if p_token is null or length(btrim(p_token)) = 0 then
    raise exception 'token obrigatorio para reclamar dor (SR-B4)';
  end if;

  -- (b) Órfã legada sem token (claim_token_hash is null) → nunca reclamável por token (F.7)
  if v_dor.claim_token_hash is null then
    raise exception 'dor sem token de claim (orfã legada — SR-B4 fail-closed)';
  end if;

  -- (c) Hash do token não confere → raise (SR-B5 — constant-time bytea comparison)
  if sha256(convert_to(p_token, 'UTF8')) <> v_dor.claim_token_hash then
    raise exception 'token invalido: claim negado (SR-B5)';
  end if;

  -- (d) Token expirado → raise (SR-B7)
  if v_dor.claim_token_expires_at is not null
     and v_dor.claim_token_expires_at < now() then
    raise exception 'token expirado: claim negado (SR-B7)';
  end if;

  -- ── Passo 5: vincula autor_id (guarda anti-corrida) ──────────────────────
  -- One-shot: claim_token_hash = null no MESMO update (SR-B6)
  update public.dor
     set autor_id          = v_uid,
         claim_token_hash  = null,
         claim_token_expires_at = null,
         updated_at        = now()
   where id = p_dor_id
     and autor_id is null;

  if not found then
    raise exception 'dor ja reclamada por outro usuario (corrida de claim)';
  end if;

  -- ── Passo 4 (empresa diferida): resolve empresa APÓS prova de posse ──────
  if v_dor.empresa_id is null and p_empresa_id is not null then
    perform 1 from public.empresa where id = p_empresa_id;
    if not found then
      raise exception 'empresa nao encontrada: p_empresa_id invalido (0041)';
    end if;
    update public.dor
       set empresa_id  = p_empresa_id,
           updated_at  = now()
     where id = p_dor_id;
  end if;

  v_empresa_id := coalesce(
    case when v_dor.empresa_id is not null then v_dor.empresa_id else p_empresa_id end
  );

  -- ── Passo 6: onboarding_representante v2 com email_corporativo de contato ─
  -- O claim_email do form vira o contato do representante (F.3/F.5).
  if v_empresa_id is not null then
    perform public.onboarding_representante(
      v_empresa_id,
      coalesce(v_dor.rep_nome, ''),
      v_dor.departamento,
      v_dor.cargo,
      v_dor.claim_email   -- p_email_corporativo = contato (F.3)
    );
  end if;

  -- A1 INTOCADA: dor permanece em_moderacao após claim.
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (6b) Grants da nova reclamar_dor — só authenticated (SR-A-H1/SR-A-H3)
-- ═══════════════════════════════════════════════════════════════════════════════
revoke execute on function public.reclamar_dor(uuid, text, uuid) from public;
revoke execute on function public.reclamar_dor(uuid, text, uuid) from anon;
grant  execute on function public.reclamar_dor(uuid, text, uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (7) Drop do overload onboarding_representante 4-arg da 0027
-- ═══════════════════════════════════════════════════════════════════════════════
drop function if exists public.onboarding_representante(uuid, text, text, text);

-- ═══════════════════════════════════════════════════════════════════════════════
-- (8) onboarding_representante v2: +p_email_corporativo (F.3 / SR-B13)
-- ═══════════════════════════════════════════════════════════════════════════════
-- A guarda de e-mail MIGRA de jwt.email para p_email_corporativo.
-- Login livre (@gmail pessoal) funciona — o corporativo é o contato do form.
create or replace function public.onboarding_representante(
  p_empresa_id        uuid,
  p_nome              text,
  p_departamento      text,
  p_cargo             text,
  p_email_corporativo text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := (select auth.uid());
  v_total int;
begin
  -- Guarda 1: sessão obrigatória (SR-A-H3)
  if v_uid is null then
    raise exception 'sessao necessaria';
  end if;

  -- Guarda 2: e-mail corporativo CONTATO (DO parâmetro, não do jwt.email — F.3)
  if not (select public.is_email_corporativo(p_email_corporativo)) then
    raise exception 'representante exige e-mail corporativo (contato — SR-B13)';
  end if;

  -- Guarda 3: empresa canônica existente (RN6)
  if p_empresa_id is null or not exists (
    select 1 from public.empresa e
     where e.id = p_empresa_id
       and e.deleted_at is null
       and e.merged_into is null
  ) then
    raise exception 'empresa canonica inexistente ou invalida';
  end if;

  -- Guarda 4: teto anti-abuso RS-ID1a (≤3 vínculos self-service)
  select count(*) into v_total
    from public.membro_empresa me
   where me.user_id = v_uid
     and me.papel = 'representante';

  if v_total >= 3 and not exists (
    select 1 from public.membro_empresa me
     where me.user_id = v_uid and me.empresa_id = p_empresa_id
  ) then
    raise exception 'limite de vinculos self-service atingido (maximo 3); contate o admin';
  end if;

  -- Passo 4: papel-base representante
  insert into public.papel_usuario (user_id, role)
  values (v_uid, 'representante')
  on conflict do nothing;

  -- Passo 5: vínculo self-link com email_corporativo de contato (SR-B13)
  insert into public.membro_empresa (user_id, empresa_id, papel, departamento, cargo, email_corporativo)
  values (v_uid, p_empresa_id, 'representante', p_departamento, p_cargo, p_email_corporativo)
  on conflict (user_id, empresa_id)
  do update set
    departamento      = excluded.departamento,
    cargo             = excluded.cargo,
    email_corporativo = excluded.email_corporativo;

  -- Passo 6: nome de exibição
  insert into public.perfil (user_id, nome_publico)
  values (v_uid, p_nome)
  on conflict (user_id)
  do update set
    nome_publico = coalesce(excluded.nome_publico, public.perfil.nome_publico),
    updated_at   = now();
end; $$;

-- Grants onboarding_representante v2: authenticated apenas
revoke execute on function public.onboarding_representante(uuid, text, text, text, text) from public;
revoke execute on function public.onboarding_representante(uuid, text, text, text, text) from anon;
grant  execute on function public.onboarding_representante(uuid, text, text, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (9) erasure_titular estendida — token + contato (A-MENOR-01 DURO → SR-B14)
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function public.erasure_titular(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'apenas admin'; end if;
  -- Herdado 0010
  update public.perfil set nome_publico = '[removido]', avatar_url = null where user_id = p_user_id;
  update auth.users set email = 'removed-' || p_user_id::text || '@example.invalid' where id = p_user_id;
  update public.notificacao set payload = '{}'::jsonb where destinatario_id = p_user_id;
  -- Herdado 0020 + token/contato (0042)
  update public.dor
     set rep_nome = '[removido]', descricao = '[removido]', departamento = null, cargo = null,
         claim_email = null, claim_token_hash = null, claim_token_expires_at = null,
         updated_at = now()
   where autor_id = p_user_id and deleted_at is null;
  -- 0027 (004): identidade do representante + contato (0042)
  update public.membro_empresa
     set departamento      = null,
         cargo             = null,
         email_corporativo = null
   where user_id = p_user_id;
  delete from public.aluno_curso where user_id = p_user_id;
  -- 0036 (005): PII livre — preserva a linha append-only de status_evento
  update public.indicacao    set mensagem = '[removido]' where pessoa_id = p_user_id and mensagem is not null;
  update public.status_evento set motivo  = '[removido]' where autor_id  = p_user_id and motivo  is not null;
  -- Intenção de apagar objetos Storage do titular
  insert into audit.record_version (tabela, record_id, op, record)
    values ('public.anexo_dor', p_user_id, 'ERASURE_STORAGE_PENDING',
            jsonb_build_object('user_id', p_user_id, 'nota', 'objetos Storage do titular a apagar no real (Onda 4)'));
  -- Anonimiza o log de auditoria (UNIÃO + claim_email + email_corporativo)
  -- Cobre: actor_id = titular, record_id = titular (perfil/membro),
  --   e record_id = dor.id onde a dor pertence ao titular (claim_email fica no audit da dor).
  update audit.record_version
     set record     = record - 'nome_publico' - 'email' - 'rep_nome' - 'dor' - 'avatar_url' - 'descricao'
                              - 'departamento' - 'cargo' - 'mensagem' - 'motivo' - 'claim_email' - 'email_corporativo',
         old_record = old_record - 'nome_publico' - 'email' - 'rep_nome' - 'dor' - 'avatar_url' - 'descricao'
                              - 'departamento' - 'cargo' - 'mensagem' - 'motivo' - 'claim_email' - 'email_corporativo'
   where actor_id = p_user_id
      or record_id = p_user_id
      or record_id in (select id from public.dor where autor_id = p_user_id);
  insert into audit.record_version (tabela, record_id, op, record)
    values ('public.perfil', p_user_id, 'ERASURE', jsonb_build_object('user_id', p_user_id));
end; $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (10) expurgar_dores_orfas_expiradas estendida (SR-B11)
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function public.expurgar_dores_orfas_expiradas()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'apenas admin pode expurgar dores orfas (SR-A10)';
  end if;

  update public.dor
     set deleted_at              = now(),
         deleted_by              = (select auth.uid()),
         descricao               = '[expurgado — LGPD SR-A10]',
         rep_nome                = '[expurgado]',
         departamento            = null,
         cargo                   = null,
         claim_email             = null,
         claim_token_hash        = null,
         claim_token_expires_at  = null,
         updated_at              = now()
   where autor_id is null
     and deleted_at is null
     and created_at < now() - interval '90 days';
end;
$$;

-- Grants: authenticated only (admin verifica is_admin() internamente)
revoke execute on function public.expurgar_dores_orfas_expiradas() from public;
revoke execute on function public.expurgar_dores_orfas_expiradas() from anon;
grant  execute on function public.expurgar_dores_orfas_expiradas() to authenticated;
