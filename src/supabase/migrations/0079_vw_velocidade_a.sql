-- Migração 0079 — views Velocidade A: Família 1 (pessoal) + Família 2 (empresa)
-- spec 008: CA1/CA3/CA4 · RN1/RN2/RN5 · RS-A1/A2/A3 · security_invoker OBRIGATÓRIO
-- Depende de: 0078 (schema analytics), 0015 (dor), 0030 (projeto), 0033 (membro_equipe),
--             0034 (funcao_tarefa), 0003 (membro_empresa), 0005 (RLS das tabelas-base).
--
-- DOWN (rollback):
--   revoke select on public.vw_meu_resumo, public.vw_painel_empresa from authenticated;
--   drop view if exists public.vw_painel_empresa;
--   drop view if exists public.vw_meu_resumo;

-- ══════════════════════════════════════════════════════════════════════════════
-- Família 1 — Painel pessoal (fresco, sem carimbo — CA3/RN5)
-- security_invoker=true: herda RLS das tabelas-base (CA2/RS-A1).
-- Filtra explicitamente por auth.uid() como defesa em profundidade.
-- Membro de projeto: via membro_equipe.pessoa_id=auth.uid() (coluna real, 0033).
-- Projeto excluído: deleted_at is null (soft-delete 0030).
-- Tarefa aberta: concluida=false AND deleted_at is null AND responsavel_id=auth.uid() (0034).
-- ══════════════════════════════════════════════════════════════════════════════
create or replace view public.vw_meu_resumo
  with (security_invoker = true)
as
select
  -- KPI 1: dores publicadas do próprio usuário (autor)
  (
    select count(*)
    from public.dor d
    where d.autor_id   = auth.uid()
      and d.status_dor = 'publicada'
      and d.deleted_at is null
  )::bigint as dores_publicadas,

  -- KPI 2: projetos em execução onde sou membro ativo
  (
    select count(distinct p.id)
    from public.membro_equipe me
    join public.projeto p on p.id = me.projeto_id
    where me.pessoa_id   = auth.uid()
      and me.deleted_at  is null
      and p.deleted_at   is null
      and p.status       not in ('finalizado', 'em_analise')
  )::bigint as projetos_em_execucao,

  -- KPI 3: projetos finalizados onde sou membro
  (
    select count(distinct p.id)
    from public.membro_equipe me
    join public.projeto p on p.id = me.projeto_id
    where me.pessoa_id   = auth.uid()
      and me.deleted_at  is null
      and p.deleted_at   is null
      and p.status       = 'finalizado'
  )::bigint as projetos_finalizados,

  -- KPI 4: tarefas abertas do próprio usuário
  (
    select count(*)
    from public.funcao_tarefa ft
    where ft.responsavel_id = auth.uid()
      and ft.concluida      = false
      and ft.deleted_at     is null
  )::bigint as tarefas_abertas
;

-- ══════════════════════════════════════════════════════════════════════════════
-- Família 2 — Painel da empresa (fresco, sem carimbo — CA3/RN5)
-- security_invoker=true: herda RLS (CA2/RS-A1).
-- RS-A3/CA5a DURO: APENAS contagens/percentuais — NENHUMA coluna de pessoa.
-- Escopo: membro_empresa do chamador (auth.uid()) → só vê empresas onde é membro.
-- ══════════════════════════════════════════════════════════════════════════════
create or replace view public.vw_painel_empresa
  with (security_invoker = true)
as
select
  me_rep.empresa_id,

  -- Contagens de dores por status (todas as dores da empresa, não só as visíveis via RLS;
  -- a RLS permite ao rep ver suas próprias dores em qualquer status_dor, então
  -- a view agrega apenas o que a sessão já pode ver — seguro por security_invoker)
  count(*) filter (where d.status_dor = 'rascunho')       ::bigint as dores_rascunho,
  count(*) filter (where d.status_dor = 'em_moderacao')   ::bigint as dores_em_moderacao,
  count(*) filter (where d.status_dor = 'publicada')      ::bigint as dores_publicadas,
  count(*) filter (where d.status_dor = 'rejeitada')      ::bigint as dores_rejeitadas,

  -- Projetos derivados das dores desta empresa (não soft-deletados)
  count(distinct p.id) filter (where p.id is not null)    ::bigint as projetos_derivados,
  count(distinct p.id) filter (where p.status = 'finalizado') ::bigint as projetos_finalizados

from public.membro_empresa me_rep
-- âncora: somente empresas onde o chamador é membro
join public.empresa e         on e.id  = me_rep.empresa_id
                              and e.deleted_at   is null
-- dores desta empresa (o security_invoker fará a RLS do chamador aplicar;
-- como o rep criou as dores, a policy dor_select_autor as devolve)
left join public.dor d        on d.empresa_id = me_rep.empresa_id
                              and d.deleted_at is null
-- projetos derivados dessas dores
left join public.projeto p    on p.dor_id    = d.id
                              and p.deleted_at is null
where me_rep.user_id = auth.uid()
group by me_rep.empresa_id
;

-- ══════════════════════════════════════════════════════════════════════════════
-- Grants: só authenticated (anon não tem painel autenticado — CA2/RN4)
-- ══════════════════════════════════════════════════════════════════════════════
grant select on public.vw_meu_resumo    to authenticated;
grant select on public.vw_painel_empresa to authenticated;
