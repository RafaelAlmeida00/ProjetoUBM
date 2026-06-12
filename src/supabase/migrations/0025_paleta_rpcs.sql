-- Migração 0025 — RPCs da paleta: resolver_paleta, salvar_paleta, ativar_paleta,
--                  excluir_paleta + extensão da allowlist restore_record('paleta')
--                  + hardening revoke/grant mínimos (feature 007-theming-paletas)
-- Contrato: contracts/paleta.md §2–§6 · security.md RS-P9/P11/P17 · padrão 0023
-- Depende de: 0024 (tabela paleta), 0008 (audit), 0009/0011 (restore_record), 0004 (is_admin)

-- ─── resolver_paleta(p_uid uuid) ─────────────────────────────────────────────
-- Precedência: empresa-do-usuário > oficial-ativa > fallback ENCAIXE embutido.
-- Determinística (stable), sem efeito colateral, executável por anon/authenticated.
-- search_path='' obrigatório (security definer com qualificação total).
--
-- Regra de desempate multi-empresa (B-007-02/IMP-1/CA9):
--   Um usuário pode ser membro de várias empresas; se 2+ tiverem paleta
--   empresa ativa+aprovada+viva, a linha escolhida deve ser determinística.
--   Regra: empresa de vínculo mais antigo (me.created_at ASC) vence,
--   tie-break por paleta mais antiga (p.created_at ASC) e por p.id ASC
--   (sempre único). Assim a paleta retornada é estável entre requests.
create or replace function public.resolver_paleta(p_uid uuid)
returns table(tokens_light jsonb, tokens_dark jsonb)
language plpgsql security definer set search_path = '' stable as $$
declare
  v_light jsonb;
  v_dark  jsonb;
begin
  -- (1) paleta de empresa do usuário (se representante de empresa canônica viva)
  --     ORDER BY obrigatório: sem ele o LIMIT 1 é arbitrário quando o usuário
  --     é membro de 2+ empresas com paleta ativa — fere CA9 (determinismo).
  if p_uid is not null then
    select p.tokens_light, p.tokens_dark
      into v_light, v_dark
      from public.paleta p
      join public.membro_empresa me on me.empresa_id = p.empresa_id
      join public.empresa e on e.id = p.empresa_id
     where me.user_id = p_uid
       and p.escopo = 'empresa'
       and p.ativa = true
       and p.deleted_at is null
       and p.aprovada_aa = true
       and e.deleted_at is null
       and e.merged_into is null
     order by me.created_at asc, p.created_at asc, p.id asc
     limit 1;
  end if;

  -- (2) oficial ativa (fallback quando não há paleta de empresa)
  if v_light is null then
    select p.tokens_light, p.tokens_dark
      into v_light, v_dark
      from public.paleta p
     where p.escopo = 'oficial'
       and p.ativa = true
       and p.deleted_at is null
     limit 1;
  end if;

  -- (3) fallback ENCAIXE embutido — nunca-sem-cor (CA10/RN10/RS-P16)
  if v_light is null then
    v_light := '{"primary":"205 68% 33%","primary-foreground":"0 0% 100%","accent":"345 62% 30%","accent-foreground":"0 0% 100%","ring":"205 68% 33%","secondary":"40 18% 88%","secondary-foreground":"215 30% 18%"}'::jsonb;
    v_dark  := '{"primary":"205 75% 62%","primary-foreground":"216 40% 10%","accent":"345 60% 60%","accent-foreground":"216 40% 10%","ring":"205 75% 62%","secondary":"216 20% 20%","secondary-foreground":"40 24% 92%"}'::jsonb;
  end if;

  return query select v_light, v_dark;
end; $$;

-- ─── salvar_paleta(...) ───────────────────────────────────────────────────────
-- Persiste nova paleta ou edita existente. Gate is_admin() interno (RS-P9/P11).
-- aprovada_aa NÃO é argumento: a RPC sempre grava true (a action validou com culori antes).
-- O CHECK paleta_tokens_hsl_validos no banco é a última porta (RS-P3/VETO-P1).
create or replace function public.salvar_paleta(
  p_id         uuid,             -- NULL = criar; preenchido = editar
  p_escopo     public.escopo_paleta,
  p_empresa_id uuid,             -- NULL para oficial
  p_nome       text,
  p_semente    text,             -- HSL (RS-P1/P3) ou NULL
  p_light      jsonb,
  p_dark       jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not (select public.is_admin()) then
    raise exception 'apenas admin';
  end if;

  if p_id is null then
    -- INSERT
    insert into public.paleta (
      escopo, empresa_id, nome, semente_hsl,
      tokens_light, tokens_dark,
      aprovada_aa, created_by
    ) values (
      p_escopo, p_empresa_id, p_nome, p_semente,
      p_light, p_dark,
      true, (select auth.uid())
    ) returning id into v_id;
  else
    -- UPDATE
    update public.paleta
       set escopo       = p_escopo,
           empresa_id   = p_empresa_id,
           nome         = p_nome,
           semente_hsl  = p_semente,
           tokens_light = p_light,
           tokens_dark  = p_dark,
           aprovada_aa  = true,
           updated_at   = now()
     where id = p_id
     returning id into v_id;
    if v_id is null then
      raise exception 'paleta nao encontrada: %', p_id;
    end if;
  end if;

  return v_id;
end; $$;

-- ─── ativar_paleta(p_id uuid) ────────────────────────────────────────────────
-- Ativa atomicamente: desativa a anterior do mesmo escopo e ativa a nova.
-- Gate is_admin() interno + bloqueio anti-bypass AA + não-excluída (CA6/VETO-P2/CA15/CA16).
create or replace function public.ativar_paleta(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_escopo     public.escopo_paleta;
  v_empresa_id uuid;
  v_aprovada   boolean;
  v_deleted    timestamptz;
begin
  if not (select public.is_admin()) then
    raise exception 'apenas admin';
  end if;

  -- lê a linha-alvo
  select escopo, empresa_id, aprovada_aa, deleted_at
    into v_escopo, v_empresa_id, v_aprovada, v_deleted
    from public.paleta
   where id = p_id;

  if not found then
    raise exception 'paleta nao encontrada: %', p_id;
  end if;

  -- paleta excluída não pode ser ativada (CA15/CA16)
  if v_deleted is not null then
    raise exception 'paleta excluida nao pode ser ativada; restaure primeiro';
  end if;

  -- anti-bypass AA: reprovar impede ativar (CA6/VETO-P2)
  if not v_aprovada then
    raise exception 'paleta nao aprovada em AA nao pode ser ativada';
  end if;

  -- desativa a anterior do mesmo escopo (atômico)
  if v_escopo = 'oficial' then
    update public.paleta
       set ativa = false, updated_at = now()
     where escopo = 'oficial'
       and ativa = true
       and deleted_at is null;
  else
    update public.paleta
       set ativa = false, updated_at = now()
     where empresa_id = v_empresa_id
       and escopo = 'empresa'
       and ativa = true
       and deleted_at is null;
  end if;

  -- ativa a nova
  update public.paleta
     set ativa = true, updated_at = now()
   where id = p_id;
end; $$;

-- ─── excluir_paleta(p_id uuid) ───────────────────────────────────────────────
-- Soft-delete: deleted_at + deleted_by + ativa=false (RN9/CA15). Reversível.
create or replace function public.excluir_paleta(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then
    raise exception 'apenas admin';
  end if;

  update public.paleta
     set deleted_at = now(),
         deleted_by = (select auth.uid()),
         ativa      = false,
         updated_at = now()
   where id = p_id;
end; $$;

-- ─── restore_record: allowlist COMPLETA (curso, empresa, dor, anexo_dor, paleta) ──
-- CREATE OR REPLACE substitui a função inteira → DEVE re-listar TODOS os ramos
-- herdados (0009/0011 curso/empresa; 0020 dor/anexo_dor) + adicionar 'paleta'.
-- Não basta "aditivo": dropar um ramo quebra o restore daquela tabela (regressão 0020).
create or replace function public.restore_record(p_tabela text, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then raise exception 'apenas admin'; end if;

  if p_tabela = 'curso' then
    update public.curso set deleted_at = null, deleted_by = null where id = p_id;
    insert into audit.record_version (tabela, record_id, op, record)
      values ('public.curso', p_id, 'RESTORE', jsonb_build_object('id', p_id));

  elsif p_tabela = 'empresa' then
    update public.empresa set deleted_at = null, deleted_by = null where id = p_id and merged_into is null;
    insert into audit.record_version (tabela, record_id, op, record)
      values ('public.empresa', p_id, 'RESTORE', jsonb_build_object('id', p_id));

  elsif p_tabela = 'dor' then
    -- ramo herdado da 0020 (RN20) — PRESERVAR a allowlist existente (não dropar)
    update public.dor set deleted_at = null, deleted_by = null where id = p_id;
    insert into audit.record_version (tabela, record_id, op, record)
      values ('public.dor', p_id, 'RESTORE', jsonb_build_object('id', p_id));

  elsif p_tabela = 'anexo_dor' then
    -- ramo herdado da 0020 (RN20) — PRESERVAR a allowlist existente (não dropar)
    update public.anexo_dor set deleted_at = null, deleted_by = null where id = p_id;
    insert into audit.record_version (tabela, record_id, op, record)
      values ('public.anexo_dor', p_id, 'RESTORE', jsonb_build_object('id', p_id));

  elsif p_tabela = 'paleta' then
    update public.paleta set deleted_at = null, deleted_by = null where id = p_id;
    insert into audit.record_version (tabela, record_id, op, record)
      values ('public.paleta', p_id, 'RESTORE', jsonb_build_object('id', p_id));

  else
    raise exception 'tabela nao restauravel: %', p_tabela;
  end if;
end; $$;

-- ─── hardening: revoke execute from public + grants mínimos (padrão 0023) ────

-- helpers de CHECK (não SECURITY DEFINER, puras/immutable): precisam ser acessíveis pelos
-- roles que executam INSERT/UPDATE na tabela paleta (os CHECKs chamam a função no contexto
-- do executor, não do dono da tabela). Grant explícito para anon e authenticated.
grant execute on function public._paleta_hsl_valido(text) to anon, authenticated;
grant execute on function public._paleta_tokens_validos(jsonb) to anon, authenticated;

-- RPCs de escrita: revoke public E anon, grant apenas authenticated (is_admin() interno faz o gate).
-- IMPORTANTE: o Supabase AUTO-CONCEDE execute a anon/authenticated em funções novas (grant
-- explícito a esses roles, não PUBLIC) → 'revoke from public' NÃO basta; é preciso 'revoke from anon'
-- explícito. Verificado no smoke da Camada B (advisor 0028). PGlite não replica esse auto-grant.
revoke execute on function public.salvar_paleta(uuid, public.escopo_paleta, uuid, text, text, jsonb, jsonb) from public, anon;
revoke execute on function public.ativar_paleta(uuid) from public, anon;
revoke execute on function public.excluir_paleta(uuid) from public, anon;

-- restore_record já foi revogado de public na 0023; re-revoga (public+anon) e re-concede (função redefinida)
revoke execute on function public.restore_record(text, uuid) from public, anon;

-- resolver_paleta: leitura pública (CA14) — executável por anon e authenticated
revoke execute on function public.resolver_paleta(uuid) from public;
grant execute on function public.resolver_paleta(uuid) to anon, authenticated;

-- RPCs de escrita: só authenticated (is_admin() interno é a segunda linha de defesa)
grant execute on function public.salvar_paleta(uuid, public.escopo_paleta, uuid, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.ativar_paleta(uuid) to authenticated;
grant execute on function public.excluir_paleta(uuid) to authenticated;
grant execute on function public.restore_record(text, uuid) to authenticated;
