-- Migração 0035 — RPCs de transição + RLS UPDATE de host (feature 005)
-- architecture.md §4.3; tasks.md T-O1.6; security.md RS5, RS6.
-- RN14, RN15, RN16, RN17, RN19 · CA13, CA14, CA15, CA16, CA18.
-- Depende de: 0030 (projeto), 0031 (guarda + projeto_update_admin + helpers), 0033 (membro_equipe), 0004 (is_admin).
--
-- A guarda BEFORE UPDATE (0031) é a defesa definitiva (valida de→para por papel + grava status_evento).
-- As RPCs são SECURITY DEFINER (bypassa RLS, mas a guarda-trigger dispara). A policy projeto_update_host
-- cobre o caminho DIRETO do host (defesa em profundidade — §4.2).

-- ── RLS UPDATE de projeto: host (aprovado→aguardando_proposta) ───────────────
create policy projeto_update_host on public.projeto
  for update to authenticated
  using      ((select public.is_project_host(id)) and status = 'aprovado')
  with check ((select public.is_project_host(id)) and status = 'aguardando_proposta');

-- ── avancar_projeto: host avança aprovado→aguardando_proposta (RN17/CA14) ────
-- Única transição formal disparável pela 005 (C1). A guarda valida is_project_host.
create or replace function public.avancar_projeto(p_projeto_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.projeto
     set status = 'aguardando_proposta', updated_at = now()
   where id = p_projeto_id and status = 'aprovado';
end; $$;

-- ── trocar_host: admin troca o host por outro coordenador indicado (RN14/CA13) ──
create or replace function public.trocar_host(p_projeto_id uuid, p_novo_host_pessoa_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_ind uuid;
begin
  if not (select public.is_admin()) then
    raise exception 'trocar_host exige admin (RN14/CA13)';
  end if;

  -- Novo host deve ter indicação ATIVA como coordenador (RN14) — de qualquer curso
  select id into v_ind from public.indicacao
   where projeto_id = p_projeto_id and pessoa_id = p_novo_host_pessoa_id
     and papel_pretendido = 'coordenador' and deleted_at is null;
  if v_ind is null then
    raise exception 'novo host deve ter indicacao ativa como coordenador (RN14)';
  end if;

  -- Rebaixa o host atual ANTES de promover (mantém uq_um_host_por_projeto)
  update public.membro_equipe
     set papel_projeto = 'co_coordenador', updated_at = now()
   where projeto_id = p_projeto_id and papel_projeto = 'host' and deleted_at is null;

  -- Promove o novo host (membro existente) ou insere
  if exists (select 1 from public.membro_equipe
             where projeto_id = p_projeto_id and pessoa_id = p_novo_host_pessoa_id and deleted_at is null) then
    update public.membro_equipe
       set papel_projeto = 'host', updated_at = now()
     where projeto_id = p_projeto_id and pessoa_id = p_novo_host_pessoa_id and deleted_at is null;
  else
    insert into public.membro_equipe (projeto_id, pessoa_id, papel_projeto, indicacao_id, created_by)
    values (p_projeto_id, p_novo_host_pessoa_id, 'host', v_ind, (select auth.uid()));
  end if;

  -- Atualiza o host do projeto (status inalterado → guarda passa sem novo evento de transição)
  update public.projeto
     set host_coordenador_id = p_novo_host_pessoa_id, updated_at = now()
   where id = p_projeto_id;
end; $$;

-- ── override_transicao: admin destrava/corrige (auditado, com motivo) (RN19/CA18) ──
create or replace function public.override_transicao(
  p_projeto_id  uuid,
  p_novo_status public.status_projeto,
  p_motivo      text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.is_admin()) then
    raise exception 'override_transicao exige admin (RN19/CA18)';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) = 0 then
    raise exception 'override_transicao exige motivo (RN19)';
  end if;
  -- Passa o motivo à guarda (0031) via GUC de sessão (local à transação)
  perform set_config('app.transicao_motivo', p_motivo, true);
  update public.projeto
     set status = p_novo_status, updated_at = now()
   where id = p_projeto_id;
end; $$;

-- ── Grants provisórios (hardening final na 0038) ─────────────────────────────
grant execute on function public.avancar_projeto(uuid)                                    to authenticated;
grant execute on function public.trocar_host(uuid, uuid)                                  to authenticated;
grant execute on function public.override_transicao(uuid, public.status_projeto, text)    to authenticated;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  DOWN (rollback — na ordem inversa)                                       ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- drop function if exists public.override_transicao(uuid, public.status_projeto, text);
-- drop function if exists public.trocar_host(uuid, uuid);
-- drop function if exists public.avancar_projeto(uuid);
-- drop policy if exists projeto_update_host on public.projeto;
-- ╚══════════════════════════════════════════════════════════════════════════╝
