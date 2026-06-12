-- Migração 0041 — reclamar_dor com empresa diferida (feature 004 — 2026-06-11)
-- Corrige achado HIGH de security review: mutate-before-authorize na Server Action.
-- O desenho ORIGINAL (architecture.md §E.3/E.4 · tasks.md §T-AN5 item 4) mandava a RPC
-- resolver a empresa diferida DENTRO da transação, após a prova de posse.
-- A implementação 0040 delegou esse update à Server Action do FE, que não consegue
-- executá-lo: RLS real bloqueia update de coluna empresa_id em dor órfã (nenhuma policy
-- permite que non-owner atualize a dor antes de ser o autor) → update silencioso de 0 linhas.
-- Resultado: empresa diferida nunca era vinculada no caminho real (bug funcional) e a
-- Server Action poderia tentar mutar ANTES de a prova de posse ocorrer (achado HIGH seg).
--
-- Esta migração:
--   (1) drop da assinatura antiga reclamar_dor(uuid) — evita ambiguidade de overload.
--   (2) create reclamar_dor(p_dor_id uuid, p_empresa_id uuid default null) DEFINER,
--       com a mesma lógica da 0040 MAIS: após prova de posse + vínculo de autor_id,
--       se v_dor.empresa_id is null AND p_empresa_id is not null → valida empresa → vincula.
--       Empresa já existente: NUNCA sobrescrita (ignora p_empresa_id silenciosamente).
--       onboarding_representante chamado com o empresa_id efetivo (dor ou recém-vinculado).
--   (3) Grants: revoke public/anon, grant authenticated (única assinatura existente = nova).
--
-- Depende de: 0040 (reclamar_dor 1-arg, autor_id nullable, claim_email),
--             0027 (onboarding_representante), 0007 (is_email_corporativo)

-- ═══════════════════════════════════════════════════════════════════════════════
-- (1) Drop da assinatura antiga (evita ambiguidade de overload)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Assinatura com 1 parâmetro obrigatório não pode coexistir com a nova (2 params,
-- p_empresa_id default null): o Postgres resolveria chamadas de 1 arg como ambíguas.
drop function if exists public.reclamar_dor(uuid);

-- ═══════════════════════════════════════════════════════════════════════════════
-- (2) create reclamar_dor(p_dor_id, p_empresa_id default null) DEFINER
-- ═══════════════════════════════════════════════════════════════════════════════
-- Invariantes da 0040 PRESERVADOS:
--   - Guarda de sessão (nunca anon — SR-A-H3)
--   - Prova de posse por e-mail OAuth (SR-A8 [DURO]) — antes de qualquer escrita
--   - Re-validação e-mail corporativo (defesa em profundidade — SR-A8)
--   - Vinculação de autor_id com guarda anti-corrida (author_id is null)
--   - Idempotência: re-claim mesmo uid = no-op silencioso
--   - A1 intocada: dor permanece em_moderacao após claim
--   - onboarding_representante chamado se empresa_id resolvido
--
-- ADICIONADO (E.3/E.4 — empresa diferida):
--   - Após vínculo de autor_id, se v_dor.empresa_id is null AND p_empresa_id not null:
--     valida existência da empresa (raise se não existir) → vincula empresa_id na dor.
--   - Se v_dor.empresa_id is not null: p_empresa_id é ignorado (NUNCA sobrescrever).
--   - onboarding_representante usa o empresa_id efetivo (v_dor.empresa_id após resolução).
create or replace function public.reclamar_dor(
  p_dor_id     uuid,
  p_empresa_id uuid default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_jwt_email  text;
  v_dor        record;
  v_empresa_id uuid;   -- empresa_id efetivo após resolução (dor ou recém-vinculado)
begin
  -- ── Passo 1: guarda de sessão (nunca anon — SR-A-H3) ─────────────────────
  if v_uid is null then
    raise exception 'sessao necessaria para reclamar dor (claim requer login)';
  end if;

  -- E-mail do OAuth (JWT — fonte de autoridade; não parâmetro — anti-spoofing SR-A12)
  v_jwt_email := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));

  -- ── Passo 2: carrega a dor (somente não deletada) ─────────────────────────
  select id, claim_email, empresa_id, rep_nome, departamento, cargo, autor_id
    into v_dor
    from public.dor
   where id = p_dor_id
     and deleted_at is null;

  if not found then
    raise exception 'dor nao encontrada ou ja deletada';
  end if;

  -- ── Passo 7 (idempotência): re-claim pelo mesmo uid = no-op silencioso ───
  if v_dor.autor_id = v_uid then
    return;  -- já reclamada por este uid; no-op
  end if;

  -- ── Passo 3: prova de posse (SR-A8 [DURO]) — ANTES de qualquer escrita ───
  -- INVARIANTE: nenhuma mutação ocorre antes desta validação.
  -- Corrige achado HIGH mutate-before-authorize (0041).
  if lower(btrim(coalesce(v_dor.claim_email, ''))) <> v_jwt_email then
    raise exception 'email divergente: claim negado (SR-A8 — prova de posse falhou)';
  end if;

  -- Re-valida e-mail corporativo (defesa em profundidade — SR-A8)
  if not (select public.is_email_corporativo(v_jwt_email)) then
    raise exception 'representante exige e-mail corporativo (SR-A8 re-validacao no claim)';
  end if;

  -- ── Passo 5: vincula autor_id (guarda anti-corrida — autor_id is null) ───
  update public.dor
     set autor_id   = v_uid,
         updated_at = now()
   where id = p_dor_id
     and autor_id is null;
  -- 0 rows → dor reclamada por outro uid (corrida; recusa explícita)
  if not found then
    raise exception 'dor ja reclamada por outro usuario (corrida de claim)';
  end if;

  -- ── Passo 4 (E.3/E.4 — empresa diferida): resolve empresa APÓS prova de posse ──
  -- O FE passa p_empresa_id (uuid já resolvido via obterOuCriarEmpresa) quando a dor
  -- nasceu sem empresa_id.  A RPC vincula aqui — dentro da transação, após autorizção.
  -- Regras:
  --   (a) Se v_dor.empresa_id is not null → empresa já setada, ignora p_empresa_id.
  --   (b) Se v_dor.empresa_id is null AND p_empresa_id is null → no-op (sem empresa).
  --   (c) Se v_dor.empresa_id is null AND p_empresa_id not null → valida + vincula.
  if v_dor.empresa_id is null and p_empresa_id is not null then
    -- Valida que a empresa existe (raise se não existir — atomicidade)
    perform 1 from public.empresa where id = p_empresa_id;
    if not found then
      raise exception 'empresa nao encontrada: p_empresa_id invalido (0041)';
    end if;
    -- Vincula empresa_id na dor
    update public.dor
       set empresa_id  = p_empresa_id,
           updated_at  = now()
     where id = p_dor_id;
  end if;

  -- ── Empresa efetiva após resolução ────────────────────────────────────────
  -- Re-lê o empresa_id da dor (pode ter sido recém-vinculado ou já existia).
  -- Usa coalesce: empresa da dor original ou a recém-vinculada.
  v_empresa_id := coalesce(
    case when v_dor.empresa_id is not null then v_dor.empresa_id else p_empresa_id end
  );

  -- ── Passo 6: enriquece identidade via onboarding_representante (0027) ────
  -- Só chama se empresa_id está resolvido; caso diferido sem empresa → no-op.
  if v_empresa_id is not null then
    perform public.onboarding_representante(
      v_empresa_id,
      coalesce(v_dor.rep_nome, ''),
      v_dor.departamento,
      v_dor.cargo
    );
  end if;

  -- A1 INTOCADA: dor permanece em_moderacao após claim.
  -- Publicar ainda exige aprovação do admin + verificação do e-mail (ADR-004B).
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (3) Grants — só authenticated (SR-A-H1/SR-A-H3)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Única assinatura existente ao final desta migração = reclamar_dor(uuid, uuid).
-- Chamada com 1 arg funciona pelo default do p_empresa_id.
revoke execute on function public.reclamar_dor(uuid, uuid) from public;
revoke execute on function public.reclamar_dor(uuid, uuid) from anon;
grant  execute on function public.reclamar_dor(uuid, uuid) to authenticated;
