-- 0062 — editar_equipe: edição IN-PLACE da equipe após a Equipe Aprovada, sem reverter status.
--
-- Regra nova (decisão do cliente 2026-06-21):
--  - Rearranjo de equipe (alunos saem, co-coordenador muda, adicionar quem já tem indicação)
--    acontece na vida real em QUALQUER etapa posterior a "Equipe Aprovada" (aprovado ..
--    em_execucao), e NÃO deve fazer o projeto voltar de status.
--  - Autorização: admin OU host do projeto (igual fechar_equipe), mas SEM exigir em_analise.
--  - É ADITIVO (idempotente): insere quem ainda não é membro, a partir de indicações ATIVAS.
--    Remoção continua via remover_membro (0060). Troca de host continua EXCLUSIVA do admin via
--    trocar_host (0035) — editar_equipe REJEITA marcar um host diferente do atual.
--  - O status do projeto fica INALTERADO (só toca updated_at). A composição inicial (em_analise
--    -> aprovado) permanece sendo fechar_equipe.
-- Rollback: drop function public.editar_equipe(uuid, jsonb).

create or replace function public.editar_equipe(p_projeto_id uuid, p_membros jsonb)
returns void language plpgsql security definer set search_path to ''
as $function$
declare
  v_membro     jsonb;
  v_pessoa     uuid;
  v_papel      public.papel_projeto;
  v_ind        uuid;
  v_is_admin   boolean := (select public.is_admin());
  v_host_atual uuid;
  v_status     text;
begin
  -- AUTZ: admin ou host do projeto (mesma autoridade do fechar_equipe), SEM exigir em_analise.
  if not (v_is_admin or (select public.is_project_host(p_projeto_id))) then
    raise exception 'editar_equipe exige o host do projeto ou admin';
  end if;

  select status::text, host_coordenador_id
    into v_status, v_host_atual
    from public.projeto where id = p_projeto_id and deleted_at is null;
  if v_status is null then
    raise exception 'projeto não encontrado';
  end if;

  -- Janela de edição in-place: equipe já formada (>= Equipe Aprovada) e projeto não finalizado.
  if v_status not in ('aprovado','aguardando_proposta','proposta_em_analise','proposta_aprovada','em_execucao') then
    raise exception 'editar_equipe só após a equipe aprovada e antes de finalizado (status atual: %)', v_status;
  end if;

  for v_membro in select value from jsonb_array_elements(p_membros)
  loop
    v_pessoa := (v_membro->>'pessoa_id')::uuid;
    v_papel  := (v_membro->>'papel_projeto')::public.papel_projeto;
    v_ind    := (v_membro->>'indicacao_id')::uuid;

    -- Troca de host NÃO acontece aqui (RN14: trocar_host é admin-only).
    if v_papel = 'host' and v_pessoa is distinct from v_host_atual then
      raise exception 'troca de host não é feita por editar_equipe — use trocar_host (admin)';
    end if;

    -- Todo membro deriva de indicação ATIVA do projeto (RN11/RN13 — mesma regra do fechar_equipe).
    if not exists (
      select 1 from public.indicacao
      where id = v_ind and projeto_id = p_projeto_id and pessoa_id = v_pessoa and deleted_at is null
    ) then
      raise exception 'membro % não deriva de indicação ativa válida (C-B1)', v_pessoa;
    end if;

    -- Idempotente: insere só quem ainda não é membro ativo (o host atual já existe → pulado).
    if not exists (
      select 1 from public.membro_equipe
      where projeto_id = p_projeto_id and pessoa_id = v_pessoa and deleted_at is null
    ) then
      insert into public.membro_equipe (projeto_id, pessoa_id, papel_projeto, indicacao_id, created_by)
      values (p_projeto_id, v_pessoa, v_papel, v_ind, (select auth.uid()));
    end if;
  end loop;

  -- Mantém exatamente 1 host (invariante) — editar_equipe nunca cria/zera host.
  if (select count(*) from public.membro_equipe
        where projeto_id = p_projeto_id and papel_projeto = 'host' and deleted_at is null) <> 1 then
    raise exception 'equipe deve ter exatamente 1 host (RN13)';
  end if;

  -- Status INALTERADO (sem reverter). Apenas toca updated_at.
  update public.projeto set updated_at = now() where id = p_projeto_id;
end; $function$;

-- ── Grants (revoke anon explícito — default privileges do hospedado concedem anon em função nova) ──
revoke all on function public.editar_equipe(uuid, jsonb) from public;
grant execute on function public.editar_equipe(uuid, jsonb) to authenticated;
revoke execute on function public.editar_equipe(uuid, jsonb) from anon;
