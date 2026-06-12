-- Migração 0021 — backfill proposal → dor (não destrutivo, idempotente) (feature 004)
-- architecture.md §4 (ADR-004A); spec §9; plan §2.4 (gate humano para 0022).
-- Depende de: 0015 (dor), 0016 (dor_curso), 0014 (proposal.empresa_id canônica), 0018 (RPCs).
-- NÃO dropa proposal — isso é 0022 (blocked por gate humano + validação do backfill no real).
-- Idempotente: re-executar não duplica (ON CONFLICT DO NOTHING por proposal_id linkado).

-- Adiciona coluna de rastreio na dor para saber qual proposal originou (aditivo, nullable)
-- Permite idempotência: se já existe uma dor para esta proposal, não duplica.
alter table public.dor add column if not exists proposal_id uuid references public.proposal(id);
create unique index if not exists dor_proposal_id_uniq on public.dor (proposal_id) where proposal_id is not null;

-- Função de backfill: migra proposals com empresa_id preenchida para dor + dor_curso.
-- Só admin executa (gate is_admin). Idempotente.
-- Status legado → status_dor: proposal sem status explícito → 'em_moderacao' (já foi enviada).
create or replace function public.backfill_proposal_para_dor()
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_p    record;
  v_dor_id uuid;
  v_n    int := 0;
  v_curso public.curso_ubm;
begin
  if not (select public.is_admin()) then raise exception 'apenas admin pode executar o backfill (gate is_admin)'; end if;

  for v_p in
    select p.id, p.user_id, p.empresa_id, p.dor, p.rep_nome,
           p.departamento, p.cargo, p.email,
           p.cursos, p.consent, p.consent_version, p.consent_at,
           p.created_at
    from public.proposal p
    where p.empresa_id is not null   -- só proposals com empresa canônica vinculada (RN6)
      and not exists (               -- idempotência: não duplica se já migrada
        select 1 from public.dor d where d.proposal_id = p.id
      )
  loop
    -- Insere a dor a partir da proposal
    insert into public.dor (
      autor_id, empresa_id, status_dor, descricao,
      rep_nome, departamento, cargo,
      consentimento, consent_version, consent_at,
      created_by, created_at, updated_at,
      proposal_id
    ) values (
      v_p.user_id,
      v_p.empresa_id,
      'em_moderacao',          -- status legado → em_moderacao (RN4: landing já submeteu)
      v_p.dor,
      coalesce(v_p.rep_nome, ''),
      v_p.departamento,
      v_p.cargo,
      coalesce(v_p.consent, false),
      v_p.consent_version,
      v_p.consent_at,
      v_p.user_id,
      v_p.created_at,
      now(),
      v_p.id
    ) returning id into v_dor_id;

    -- Migra cursos (proposal.cursos[] → dor_curso rows, sem duplicata)
    if v_p.cursos is not null then
      foreach v_curso in array v_p.cursos loop
        insert into public.dor_curso (dor_id, curso)
        values (v_dor_id, v_curso)
        on conflict (dor_id, curso) do nothing;
      end loop;
    end if;

    v_n := v_n + 1;
  end loop;

  return v_n;
end; $$;
grant execute on function public.backfill_proposal_para_dor() to authenticated;
