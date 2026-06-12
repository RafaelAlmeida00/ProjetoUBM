-- Migração 0040 — Envio anônimo de dor na /propor (feature 004 delta — 2026-06-10)
-- architecture.md §Delta E.0–E.10 · tasks.md §TASKS-delta T-AN1..T-AN10
-- security.md §Delta SR-A1..SR-A12 + SR-A-H1/H2/H3
-- ADR-004E (Opção A: autor_id nullable + claim por e-mail OAuth)
--
-- Depende de: 0015 (dor/status_dor), 0007 (is_email_corporativo), 0012 (buscar_empresa),
--             0027 (onboarding_representante), 0028 (submeter_dor_landing 9-arg, matriz revoke),
--             0008 (audit)
--
-- Ordem interna (E.5 §conteúdo):
--   (1) autor_id DROP NOT NULL
--   (2) ADD COLUMN claim_email
--   (2b) índice parcial em claim_email
--   (3) constraint dor_orfa_ou_autor
--   (3b) constraint dor_publicada_exige_autor
--   (4) drop+create submeter_dor_landing (assinatura estendida — ramo logado×anon)
--   (5) re-grant cirúrgico em submeter_dor_landing (anon + authenticated)
--   (6) create reclamar_dor(p_dor_id uuid) DEFINER authenticated-only
--   (7) revoke/grant em reclamar_dor (só authenticated)
--   (8) confirmação de RLS órfã admin-only (sem DDL — só comentário + teste externo)
--   (9) expurgar_dores_orfas_expiradas() DEFINER admin-only

-- ═══════════════════════════════════════════════════════════════════════════════
-- (1) autor_id nullable — Opção A (ADR-004E E.1)
-- ═══════════════════════════════════════════════════════════════════════════════
-- PROBLEMA: dor.autor_id era NOT NULL → órfã sem login não cabia no schema.
-- CORREÇÃO: tornar nullable. Dor órfã (anon) nasce com autor_id = NULL.
-- EROSÃO CONTIDA: dor_select_autor usa (autor_id = auth.uid()); com autor_id NULL,
--   a expressão avalia NULL → nega (deny-by-default de graça, sem policy nova — E.0.3).
alter table public.dor alter column autor_id drop not null;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (2) ADD COLUMN claim_email — chave de prova de posse (SR-A8)
-- ═══════════════════════════════════════════════════════════════════════════════
-- E-mail do form anônimo, normalizado (lower/btrim) na escrita pela RPC (E.2).
-- Nulo para dores logadas (não precisam de claim).
alter table public.dor add column if not exists claim_email text;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (2b) Índice parcial em claim_email para órfãs (perf — E.5)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Claim e fila de órfãs rápidos; parcial (só válido para linhas que interessam).
create index if not exists dor_claim_email_orfa_idx
  on public.dor (lower(claim_email))
  where autor_id is null and deleted_at is null;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (3) Constraint dor_orfa_ou_autor — órfã só existe em moderação (SR-A1/SR-A6)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Garante que dor sem autor (anônima/lead) só pode nascer em status em_moderacao.
-- Impede que rascunho, rejeitada ou publicada existam sem autor.
alter table public.dor
  add constraint dor_orfa_ou_autor
    check (autor_id is not null or status_dor = 'em_moderacao');

-- ═══════════════════════════════════════════════════════════════════════════════
-- (3b) Constraint publicada exige autor_id — reforço A1 (SR-A6 / ADR-004B)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Dor publicada SEMPRE tem autor: o caminho A1 (moderar+verificar) só corre pós-claim.
-- Mesmo que admin tente publicar uma órfã, a constraint impede.
alter table public.dor
  add constraint dor_publicada_exige_autor
    check (status_dor <> 'publicada' or autor_id is not null);

-- ═══════════════════════════════════════════════════════════════════════════════
-- (4) drop+create submeter_dor_landing — assinatura estendida (E.2 / E.5 item 4)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Assinatura antiga (9-arg, 0028): drop explícito pois create-or-replace não pode adicionar param.
-- Assinatura nova (11-arg): + p_email text + p_empresa_nome text default null.
-- Ramo de autoridade fail-closed: logado (v_uid not null) → comportamento intacto (compat);
-- anônimo (v_uid is null) → guarda de e-mail corporativo por parâmetro (SR-A8).
drop function if exists public.submeter_dor_landing(uuid, text, text, text, text, boolean, text, timestamptz, public.curso_ubm[]);

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
  p_email           text              default null,   -- NOVO: e-mail do form (obrigatório no ramo anon)
  p_empresa_nome    text              default null    -- NOVO: nome p/ empresa diferida (E.3)
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_email  text;
  v_dor_id uuid;
begin
  -- ── Tetos de payload (SR-A7 — invariante de banco, não só borda) ─────────
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

  -- ── Guarda de consentimento (SR-A9 — obrigatório em ambos os ramos) ──────
  if not coalesce(p_consentimento, false) or p_consent_version is null then
    raise exception 'consentimento LGPD obrigatorio (RN7/SR-A9)';
  end if;

  -- ── Guarda de descrição não-vazia (ambos os ramos) ───────────────────────
  if p_descricao is null or length(btrim(p_descricao)) = 0 then
    raise exception 'descricao nao pode ser vazia';
  end if;

  -- ══ RAMO DE AUTORIDADE (fail-closed) ═════════════════════════════════════

  if v_uid is not null then
    -- ── Ramo LOGADO (caminho legado — compat intacta) ─────────────────────
    -- E-mail vem do JWT (não do parâmetro — o parâmetro é ignorado no logado).
    v_email := (select auth.jwt() ->> 'email');

    -- Guarda: e-mail corporativo (RN23/CA23 — alinhado com onboarding_representante)
    if not (select public.is_email_corporativo(v_email)) then
      raise exception 'representante exige e-mail corporativo (RN23/CA23)';
    end if;

    -- Guarda: empresa canônica obrigatória
    if p_empresa_id is null then
      raise exception 'empresa_id obrigatorio (RN6)';
    end if;

    -- Insere com autor_id = v_uid (comportamento 0028 preservado)
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

  else
    -- ── Ramo ANÔNIMO (caminho novo — SR-A2) ──────────────────────────────
    -- Guarda de sessão substituída por guarda de e-mail corporativo por parâmetro (SR-A8).
    -- p_email obrigatório no ramo anon.
    if p_email is null or length(btrim(p_email)) = 0 then
      raise exception 'email obrigatorio no ramo anonimo (SR-A8)';
    end if;

    -- Normaliza o e-mail (lower + btrim — E.3)
    v_email := lower(btrim(p_email));

    -- Guarda: e-mail corporativo server-side (SR-A8 — mesma denylist 0007, não reimplementar)
    if not (select public.is_email_corporativo(v_email)) then
      raise exception 'representante exige e-mail corporativo (RN23/CA23/SR-A8)';
    end if;

    -- Insere dor ÓRFÃ: autor_id = NULL, em_moderacao, claim_email = e-mail normalizado
    -- empresa_id pode ser NULL se diferida ao claim (E.3); a constraint dor_orfa_ou_autor
    -- garante que status = 'em_moderacao' (única combinação válida sem autor).
    insert into public.dor (
      autor_id, empresa_id, status_dor, descricao,
      rep_nome, departamento, cargo,
      consentimento, consent_version, consent_at,
      claim_email,
      created_by
    ) values (
      null, p_empresa_id, 'em_moderacao', p_descricao,
      coalesce(p_rep_nome, ''), p_departamento, p_cargo,
      p_consentimento, p_consent_version, p_consent_at,
      v_email,
      null   -- audit.actor_id nullable (0008) — ator = 'origem landing-anon'
    ) returning id into v_dor_id;

  end if;

  -- ── Associa cursos (ambos os ramos — SECURITY DEFINER bypassa policy verificado) ─
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
-- (5) Re-grant cirúrgico em submeter_dor_landing (SR-A-H1/H2 — E.5 item 5)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Reverte SÓ a linha 0028:166 (revoke anon) — toda a matriz 0028 permanece.
-- A única exceção: submeter_dor_landing agora tem execute para anon (porta anon — SR-A1).
revoke execute on function public.submeter_dor_landing(uuid, text, text, text, text, boolean, text, timestamptz, public.curso_ubm[], text, text) from public;
grant  execute on function public.submeter_dor_landing(uuid, text, text, text, text, boolean, text, timestamptz, public.curso_ubm[], text, text) to anon;
grant  execute on function public.submeter_dor_landing(uuid, text, text, text, text, boolean, text, timestamptz, public.curso_ubm[], text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (6) create reclamar_dor(p_dor_id uuid) DEFINER authenticated-only (E.4 / E.5 item 6)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Claim own-only por igualdade de e-mail OAuth (SR-A8/SR-A12/SR-A-H3).
-- Transação atômica fail-closed: guarda sessão → carrega órfã → prova de posse →
-- vincula autor_id → onboarding_representante (reusa 0027) → idempotente.
-- A1 intocada: após claim a dor segue em_moderacao (ADR-004B).
create or replace function public.reclamar_dor(p_dor_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_jwt_email text;
  v_dor      record;
begin
  -- Passo 1: guarda de sessão (nunca anon — SR-A-H3)
  if v_uid is null then
    raise exception 'sessao necessaria para reclamar dor (claim requer login)';
  end if;

  -- E-mail do OAuth (JWT — fonte de autoridade; não parâmetro — anti-spoofing SR-A12)
  v_jwt_email := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));

  -- Passo 2: carrega a dor (somente órfã: autor_id is null + não deletada)
  -- Se a dor já foi reclamada pelo mesmo uid → idempotência (passo 7 abaixo)
  select id, claim_email, empresa_id, rep_nome, departamento, cargo, autor_id
    into v_dor
    from public.dor
   where id = p_dor_id
     and deleted_at is null;

  if not found then
    raise exception 'dor nao encontrada ou ja deletada';
  end if;

  -- Passo 7 (idempotência): re-claim pelo mesmo uid = no-op silencioso
  if v_dor.autor_id = v_uid then
    return;  -- já reclamada por este uid; no-op
  end if;

  -- Passo 3: prova de posse (SR-A8 [DURO])
  -- Só prossegue se jwt.email = claim_email (case-insensitive)
  if lower(btrim(coalesce(v_dor.claim_email, ''))) <> v_jwt_email then
    raise exception 'email divergente: claim negado (SR-A8 — prova de posse falhou)';
  end if;

  -- Re-valida e-mail corporativo (defesa em profundidade — SR-A8)
  if not (select public.is_email_corporativo(v_jwt_email)) then
    raise exception 'representante exige e-mail corporativo (SR-A8 re-validacao no claim)';
  end if;

  -- Passo 5: vincula autor_id (cláusula autor_id is null = guarda anti-corrida + idempotência)
  update public.dor
     set autor_id   = v_uid,
         updated_at = now()
   where id = p_dor_id
     and autor_id is null;
  -- Se 0 rows updated → dor já foi reclamada por outro uid (corrida; recusa implícita)
  if not found then
    raise exception 'dor ja reclamada por outro usuario (corrida de claim)';
  end if;

  -- Passo 4: resolve empresa diferida (E.3) — se empresa_id é null, não pode onboarding ainda
  -- (a Server Action passa empresa_id resolvido; a RPC não cria empresa)
  -- O onboarding usa o empresa_id que já está na dor.

  -- Passo 6: enriquece identidade via onboarding_representante (0027 — NÃO duplicar lógica)
  -- Só chama se empresa_id está resolvido (não null); caso diferido → no-op aqui.
  if v_dor.empresa_id is not null then
    perform public.onboarding_representante(
      v_dor.empresa_id,
      coalesce(v_dor.rep_nome, ''),
      v_dor.departamento,
      v_dor.cargo
    );
  end if;

  -- A1 INTOCADA: dor permanece em_moderacao após claim.
  -- Publicar ainda exige aprovação do admin + verificação do e-mail (ADR-004B).
  -- O login Google é a verificação; a publicação continua pelo caminho A1 (moderar_dor + trigger).
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (7) Grants de reclamar_dor — só authenticated (SR-A-H1/SR-A-H3)
-- ═══════════════════════════════════════════════════════════════════════════════
revoke execute on function public.reclamar_dor(uuid) from public;
revoke execute on function public.reclamar_dor(uuid) from anon;
grant  execute on function public.reclamar_dor(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (8) RLS órfã admin-only — sem DDL (já garantido pela policy existente — E.0.3)
-- ═══════════════════════════════════════════════════════════════════════════════
-- A policy dor_select_autor (0015:78-79) usa autor_id = (select auth.uid()).
-- Com autor_id NULL, a expressão avalia NULL → nega (deny-by-default).
-- dor_select_publica só expõe status_dor='publicada' — órfã (em_moderacao) não vaza.
-- dor_select_admin expõe para is_admin() — admin vê a fila.
-- RESULTADO: órfã visível SÓ por admin, de graça, sem policy nova.
-- Confirmado por teste externo 0040_seg_orfa_admin_only.exec.test.ts (T-AN7).

-- ═══════════════════════════════════════════════════════════════════════════════
-- (9) expurgar_dores_orfas_expiradas() — retenção LGPD (SR-A10 / E.5 item 9)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Anonimiza/soft-deleta dores órfãs não-reclamadas com created_at < now() - 90 dias.
-- Agendável por pg_cron (já existe, 002) ou chamada admin direta.
-- Auditada via trigger zzz_audit existente (0008).
create or replace function public.expurgar_dores_orfas_expiradas()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  -- Apenas admin pode invocar (defesa em profundidade — a função é DEFINER mas só admin chama)
  if not (select public.is_admin()) then
    raise exception 'apenas admin pode expurgar dores orfas (SR-A10)';
  end if;

  -- Anonimiza PII das dores órfãs expiradas (autor_id is null + criada há > 90 dias)
  -- Soft-delete (deleted_at) + apaga PII: descricao, rep_nome, departamento, cargo, claim_email
  update public.dor
     set deleted_at    = now(),
         deleted_by    = (select auth.uid()),
         descricao     = '[expurgado — LGPD SR-A10]',
         rep_nome      = '[expurgado]',
         departamento  = null,
         cargo         = null,
         claim_email   = null,
         updated_at    = now()
   where autor_id is null
     and deleted_at is null
     and created_at < now() - interval '90 days';
end;
$$;

-- Grants: apenas authenticated (admin verifica is_admin() internamente)
-- anon nunca deve executar isto
revoke execute on function public.expurgar_dores_orfas_expiradas() from public;
revoke execute on function public.expurgar_dores_orfas_expiradas() from anon;
grant  execute on function public.expurgar_dores_orfas_expiradas() to authenticated;
