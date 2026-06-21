-- 0069 — Substituição dos stubs admin-only da guarda (0060) pelos atores reais da 006
--
-- A guarda _projeto_guarda_transicao (criada na 0031, atualizada na 0060) contém 5 ramos
-- com 'transicao pertence a feature 006' que permitem só admin. Esta migração substitui
-- esses ramos pelos atores reais (arch §4.5 / RS4), preservando:
--   - todas as transições da 005 (em_analise↔aprovado, aprovado→aguardando_proposta)
--   - o else de override admin (qualquer par inválido → só admin)
--   - a gravação de status_evento em toda transição aceita
--
-- Atores reais por transição:
--   aguardando_proposta → proposta_em_analise : host OU admin (enviar_proposta)
--   proposta_em_analise → proposta_aprovada   : admin (a RPC confirmar_assinatura roda como
--                                               SECURITY DEFINER → auth.uid() = dono da fn
--                                               que é superuser; o webhook usa service_role
--                                               que bypassa RLS; a guarda é 2ª linha)
--   proposta_em_analise → aguardando_proposta : is_company_rep(empresa da dor) OU admin
--                                               (contraproposta + expiração pg_cron)
--   proposta_aprovada   → em_execucao         : host OU admin (iniciar_execucao)
--   em_execucao         → finalizado           : host OU admin (finalizar_projeto)
--
-- Re-afirmar grants (lição 0063: CREATE OR REPLACE reseta para PUBLIC).
--
-- Rollback: restaurar a versão da 0060 (stubs admin-only) e re-afirmar grants.

create or replace function public._projeto_guarda_transicao()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_de         text := old.status::text;
  v_para       text := new.status::text;
  v_uid        uuid := (select auth.uid());
  v_empresa_id uuid;
begin
  -- Se o status não mudou: UPDATE de conteúdo — deixa passar
  if v_de = v_para then return new; end if;

  -- Matriz de transições (de, para) × ator:
  case
    -- ── Transições da 005 (inalteradas) ───────────────────────────────────────
    when v_de = 'em_analise' and v_para = 'aprovado' then
      -- fechar_equipe: host OU admin (0060)
      if not (select public.is_project_host(new.id)) and not (select public.is_admin()) then
        raise exception 'fechar equipe (em_analise->aprovado) exige host ou admin (RN10/CA9)';
      end if;

    when v_de = 'aprovado' and v_para = 'aguardando_proposta' then
      -- avancar_projeto: host OU admin (0035/0060)
      if not (select public.is_project_host(new.id)) and not (select public.is_admin()) then
        raise exception 'transicao aprovado->aguardando_proposta exige host ou admin (RN17/CA14)';
      end if;

    -- ── Transições da 006 — atores reais (substitui os stubs) ─────────────────

    when v_de = 'aguardando_proposta' and v_para = 'proposta_em_analise' then
      -- enviar_proposta: só host OU admin (RN1/RN2 — representante e aluno não enviam)
      if not (select public.is_project_host(new.id)) and not (select public.is_admin()) then
        raise exception 'aguardando_proposta->proposta_em_analise exige host ou admin (RN1/CA1)';
      end if;

    when v_de = 'proposta_em_analise' and v_para = 'proposta_aprovada' then
      -- confirmar_assinatura (SECURITY DEFINER) ou override admin (CA23/CA26).
      -- Quando auth.uid() é NULL o UPDATE vem de uma RPC SECURITY DEFINER (dono da função)
      -- ou de service_role (webhook) — ambos são caminhos legítimos e privilegiados (arch §4.5).
      -- Para usuários autenticados comuns: só admin pode fazer UPDATE direto.
      if (select auth.uid()) is not null and not (select public.is_admin()) then
        raise exception 'proposta_em_analise->proposta_aprovada so via RPC confirmar_assinatura ou admin (RS4)';
      end if;

    when v_de = 'proposta_em_analise' and v_para = 'aguardando_proposta' then
      -- contrapropor_proposta: representante da empresa da dor OU admin/job (RN15/CA11)
      -- expirar_propostas() é SECURITY DEFINER → auth.uid() = NULL → passa sem checar ator.
      -- Para usuários autenticados: somente representante da empresa ou admin.
      if v_uid is not null then
        select d.empresa_id into v_empresa_id
          from public.projeto pj
          join public.dor d on d.id = pj.dor_id
         where pj.id = new.id;
        if not (select public.is_company_rep(v_empresa_id)) and not (select public.is_admin()) then
          raise exception 'proposta_em_analise->aguardando_proposta exige representante da empresa ou admin (CA11)';
        end if;
      end if;

    when v_de = 'proposta_aprovada' and v_para = 'em_execucao' then
      -- iniciar_execucao: só host OU admin (RN18a/CA16)
      if not (select public.is_project_host(new.id)) and not (select public.is_admin()) then
        raise exception 'proposta_aprovada->em_execucao exige host ou admin (RN18a/CA16)';
      end if;

    when v_de = 'em_execucao' and v_para = 'finalizado' then
      -- finalizar_projeto: só host OU admin (RN18b/CA17)
      if not (select public.is_project_host(new.id)) and not (select public.is_admin()) then
        raise exception 'em_execucao->finalizado exige host ou admin (RN18b/CA17)';
      end if;

    else
      -- Qualquer outro par: só admin (override auditado — RN23/CA23)
      if not (select public.is_admin()) then
        raise exception 'transicao de estado invalida: % -> % (RN23)', v_de, v_para;
      end if;
  end case;

  -- Em toda transição aceita: grava status_evento (timeline append-only — RN20)
  insert into public.status_evento (projeto_id, de_status, para_status, autor_id, motivo)
  values (new.id, old.status, new.status, v_uid,
          nullif(current_setting('app.transicao_motivo', true), ''));

  return new;
end; $$;

-- Re-afirmar grants da função recriada (lição 0063 — CREATE OR REPLACE reseta para PUBLIC)
revoke all     on function public._projeto_guarda_transicao() from public, anon, authenticated;
-- trigger fn: nenhum grant de execute para roles de app (invocada pelo runtime do Postgres)
