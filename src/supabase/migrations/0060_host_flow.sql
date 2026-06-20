-- 0060 — Fluxo de host: admin ELEGE (sem fechar) / HOST compõe e fecha / reversibilidade do admin
--
-- Regra nova (decisão do cliente):
--  - Admin elege o host (entre os coordenadores indicados); o projeto CONTINUA em_analise (aberto a
--    novas indicações). Só o HOST compõe a equipe e fecha (→ aprovado).
--  - Admin pode fechar a qualquer momento (override), reabrir indicações (qualquer status → em_analise),
--    refechar, e trocar/re-eleger o host a cada reabertura.
--  - Host e admin podem remover membros (menos a si mesmos; o host não é removível por aqui).
--
-- Desenho: eleger_host insere o membro host (dispara a notificação 'eleito_host' via trigger) e
-- mantém em_analise. is_project_host passa a reconhecê-lo. fechar_equipe muda só a AUTZ (host OU admin)
-- e fica idempotente (pula quem já é membro — o host eleito). Guard libera o host a fechar.
-- Rollback: recriar fechar_equipe/guarda/indicacoes_coordenador da 0033/0031/0052 e dropar as novas RPCs.

-- ── 1) eleger_host: admin elege/re-elege host; projeto SEGUE em_analise (aberto) ──
create or replace function public.eleger_host(p_projeto_id uuid, p_host_pessoa_id uuid)
returns void language plpgsql security definer set search_path to ''
as $function$
declare
  v_ind uuid;
  v_ja_membro boolean;
begin
  if not (select public.is_admin()) then
    raise exception 'eleger_host exige admin';
  end if;
  if not exists (select 1 from public.projeto where id = p_projeto_id and status = 'em_analise' and deleted_at is null) then
    raise exception 'eleger_host só em projeto em_analise (aberto a indicações)';
  end if;
  select id into v_ind from public.indicacao
   where projeto_id = p_projeto_id and pessoa_id = p_host_pessoa_id
     and papel_pretendido = 'coordenador' and deleted_at is null;
  if v_ind is null then
    raise exception 'host deve ter indicação ativa como coordenador (RN11)';
  end if;
  -- rebaixa host atual (se for outra pessoa)
  update public.membro_equipe set papel_projeto = 'co_coordenador', updated_at = now()
   where projeto_id = p_projeto_id and papel_projeto = 'host' and deleted_at is null
     and pessoa_id <> p_host_pessoa_id;
  select exists (
    select 1 from public.membro_equipe
     where projeto_id = p_projeto_id and pessoa_id = p_host_pessoa_id and deleted_at is null
  ) into v_ja_membro;
  if v_ja_membro then
    update public.membro_equipe set papel_projeto = 'host', updated_at = now()
     where projeto_id = p_projeto_id and pessoa_id = p_host_pessoa_id and deleted_at is null;
    -- UPDATE não dispara o trigger AFTER INSERT → notifica manualmente (re-eleição)
    perform public.criar_notificacao(p_host_pessoa_id, 'status_mudou',
      jsonb_build_object('evento', 'eleito_host', 'projeto_id', p_projeto_id::text));
  else
    -- INSERT dispara _membro_equipe_notificar('eleito_host')
    insert into public.membro_equipe (projeto_id, pessoa_id, papel_projeto, indicacao_id, created_by)
    values (p_projeto_id, p_host_pessoa_id, 'host', v_ind, (select auth.uid()));
  end if;
  update public.projeto set host_coordenador_id = p_host_pessoa_id, updated_at = now()
   where id = p_projeto_id;
end; $function$;

-- ── 2) fechar_equipe: AUTZ = host do projeto OU admin; idempotente (pula quem já é membro) ──
create or replace function public.fechar_equipe(p_projeto_id uuid, p_host_pessoa_id uuid, p_membros jsonb)
returns void language plpgsql security definer set search_path to ''
as $function$
declare
  v_membro     jsonb;
  v_pessoa     uuid;
  v_papel      public.papel_projeto;
  v_ind        uuid;
  v_host_count int := 0;
  v_is_admin   boolean := (select public.is_admin());
  v_host_atual uuid;
begin
  if not (v_is_admin or (select public.is_project_host(p_projeto_id))) then
    raise exception 'fechar_equipe exige o host do projeto ou admin';
  end if;
  if not exists (
    select 1 from public.projeto where id = p_projeto_id and status = 'em_analise' and deleted_at is null
  ) then
    raise exception 'projeto não está em em_analise — janela de fechamento fechada (RN9)';
  end if;
  -- host não-admin só fecha com ele mesmo como host
  if not v_is_admin and p_host_pessoa_id <> (select auth.uid()) then
    raise exception 'host só fecha a equipe com ele mesmo como host';
  end if;
  -- se já há host eleito, p_host deve ser ele (trocar via eleger_host/trocar_host)
  select host_coordenador_id into v_host_atual from public.projeto where id = p_projeto_id;
  if v_host_atual is not null and v_host_atual <> p_host_pessoa_id then
    raise exception 'host já eleito difere — use eleger_host/trocar_host para mudar';
  end if;
  if not exists (
    select 1 from public.indicacao
    where projeto_id = p_projeto_id and pessoa_id = p_host_pessoa_id
      and papel_pretendido = 'coordenador' and deleted_at is null
  ) then
    raise exception 'host deve ter indicação ativa como coordenador (RN11/CA11)';
  end if;
  for v_membro in select value from jsonb_array_elements(p_membros)
  loop
    v_pessoa := (v_membro->>'pessoa_id')::uuid;
    v_papel  := (v_membro->>'papel_projeto')::public.papel_projeto;
    v_ind    := (v_membro->>'indicacao_id')::uuid;
    if not exists (
      select 1 from public.indicacao
      where id = v_ind and projeto_id = p_projeto_id and pessoa_id = v_pessoa and deleted_at is null
    ) then
      raise exception 'membro % não deriva de indicação ativa válida (C-B1)', v_pessoa;
    end if;
    if v_papel = 'host' and v_pessoa <> p_host_pessoa_id then
      raise exception 'host do array (%) difere de p_host_pessoa_id (%) — RN13', v_pessoa, p_host_pessoa_id;
    end if;
    -- idempotente: insere só quem ainda não é membro ativo (o host eleito já pode existir)
    if not exists (
      select 1 from public.membro_equipe
      where projeto_id = p_projeto_id and pessoa_id = v_pessoa and deleted_at is null
    ) then
      insert into public.membro_equipe (projeto_id, pessoa_id, papel_projeto, indicacao_id, created_by)
      values (p_projeto_id, v_pessoa, v_papel, v_ind, (select auth.uid()));
    end if;
  end loop;
  -- exatamente 1 host ativo (cobre admin-direct sem eleger_host e host-close pós eleger_host)
  select count(*) into v_host_count from public.membro_equipe
   where projeto_id = p_projeto_id and papel_projeto = 'host' and deleted_at is null;
  if v_host_count <> 1 then
    raise exception 'equipe deve ter exatamente 1 host (RN13) — encontrados %', v_host_count;
  end if;
  update public.projeto
     set status = 'aprovado', host_coordenador_id = p_host_pessoa_id, aprovado_em = now(), updated_at = now()
   where id = p_projeto_id;
end; $function$;

-- ── 3) Guard: fechar (em_analise→aprovado) passa a ser do HOST ou admin ──
create or replace function public._projeto_guarda_transicao()
returns trigger language plpgsql security definer set search_path to ''
as $function$
declare
  v_de   text := old.status::text;
  v_para text := new.status::text;
  v_uid  uuid := (select auth.uid());
begin
  if v_de = v_para then return new; end if;

  case
    when v_de = 'em_analise' and v_para = 'aprovado' then
      if not (select public.is_project_host(new.id)) and not (select public.is_admin()) then
        raise exception 'fechar equipe (em_analise->aprovado) exige o host do projeto ou admin (RN10/CA9)';
      end if;
    when v_de = 'aprovado' and v_para = 'aguardando_proposta' then
      if not (select public.is_project_host(new.id)) and not (select public.is_admin()) then
        raise exception 'transicao aprovado->aguardando_proposta exige host do projeto (RN17/CA14)';
      end if;
    when v_de = 'aguardando_proposta' and v_para = 'proposta_em_analise' then
      if not (select public.is_admin()) then raise exception 'transicao pertence a feature 006'; end if;
    when v_de = 'proposta_em_analise' and v_para = 'proposta_aprovada' then
      if not (select public.is_admin()) then raise exception 'transicao pertence a feature 006'; end if;
    when v_de = 'proposta_em_analise' and v_para = 'aguardando_proposta' then
      if not (select public.is_admin()) then raise exception 'transicao pertence a feature 006'; end if;
    when v_de = 'proposta_aprovada' and v_para = 'em_execucao' then
      if not (select public.is_admin()) then raise exception 'transicao pertence a feature 006'; end if;
    when v_de = 'em_execucao' and v_para = 'finalizado' then
      if not (select public.is_admin()) then raise exception 'transicao pertence a feature 006'; end if;
    else
      -- inclui reabertura (qualquer→em_analise): admin pode (reabrir_indicacoes)
      if not (select public.is_admin()) then
        raise exception 'transicao de estado invalida: % -> % (RN16)', v_de, v_para;
      end if;
  end case;

  insert into public.status_evento (projeto_id, de_status, para_status, autor_id, motivo)
  values (new.id, old.status, new.status, v_uid,
          nullif(current_setting('app.transicao_motivo', true), ''));
  return new;
end; $function$;

-- ── 4) reabrir_indicacoes: admin reabre (qualquer status → em_analise) ──
create or replace function public.reabrir_indicacoes(p_projeto_id uuid)
returns void language plpgsql security definer set search_path to ''
as $function$
begin
  if not (select public.is_admin()) then
    raise exception 'reabrir_indicacoes exige admin';
  end if;
  if not exists (select 1 from public.projeto where id = p_projeto_id and deleted_at is null) then
    raise exception 'projeto não encontrado';
  end if;
  -- volta a em_analise (janela de indicação aberta). O guard (else) autoriza admin.
  -- Mantém os membros/host atuais; o admin pode trocar via eleger_host/remover_membro.
  update public.projeto set status = 'em_analise', aprovado_em = null, updated_at = now()
   where id = p_projeto_id and status <> 'em_analise';
end; $function$;

-- ── 5) remover_membro: host ou admin removem membro (não a si; o host não por aqui) ──
create or replace function public.remover_membro(p_projeto_id uuid, p_pessoa_id uuid)
returns void language plpgsql security definer set search_path to ''
as $function$
begin
  if not ((select public.is_admin()) or (select public.is_project_host(p_projeto_id))) then
    raise exception 'remover_membro exige o host do projeto ou admin';
  end if;
  if p_pessoa_id = (select auth.uid()) then
    raise exception 'não é permitido remover a si mesmo';
  end if;
  if exists (
    select 1 from public.membro_equipe
    where projeto_id = p_projeto_id and pessoa_id = p_pessoa_id and papel_projeto = 'host' and deleted_at is null
  ) then
    raise exception 'o host não pode ser removido por aqui — use eleger_host/trocar_host';
  end if;
  update public.membro_equipe set deleted_at = now(), deleted_by = (select auth.uid()), updated_at = now()
   where projeto_id = p_projeto_id and pessoa_id = p_pessoa_id and deleted_at is null;
end; $function$;

-- ── 6) indicacoes_coordenador: o HOST eleito também enxerga as indicações (para compor a equipe) ──
create or replace function public.indicacoes_coordenador(p_projeto_id uuid)
returns table(id uuid, projeto_id uuid, pessoa_id uuid, papel_pretendido text, mensagem text, created_at timestamptz, deleted_at timestamptz, aluno_nome text, aluno_email text, curso text)
language plpgsql stable security definer set search_path to ''
as $function$
begin
  if not (
    (select public.is_dor_course_coordinator(p_projeto_id))
    or (select public.is_project_host(p_projeto_id))
    or (select public.is_admin())
  ) then
    return;
  end if;
  return query
    select i.id, i.projeto_id, i.pessoa_id, i.papel_pretendido::text, i.mensagem,
      i.created_at, i.deleted_at,
      coalesce(p.nome_publico, '') as aluno_nome,
      coalesce(u.email::text, '')  as aluno_email,
      coalesce(
        (select string_agg(c.nome, ', ' order by c.nome)
           from public.coordenador_curso cc
           join public.curso c on c.id = cc.curso_id
          where cc.user_id = i.pessoa_id and cc.aprovado = true),
        (select string_agg(dc.curso::text, ', ' order by dc.curso::text)
           from public.dor_curso dc
           join public.projeto pr on pr.dor_id = dc.dor_id
          where pr.id = p_projeto_id limit 1),
        '') as curso
    from public.indicacao i
    join auth.users u on u.id = i.pessoa_id
    left join public.perfil p on p.user_id = i.pessoa_id
    where i.projeto_id = p_projeto_id
    order by i.created_at asc;
end; $function$;

-- ── 7) equipe_gestao: lista membros com pessoa_id+nome para admin/host (gerir/remover) ──
-- Diferente de equipe_publica (anonimizada/pseudonimizada): só admin/host, e expõe pessoa_id
-- porque é o identificador necessário para remover_membro. NUNCA exposto a anon/terceiro.
create or replace function public.equipe_gestao(p_projeto_id uuid)
returns table(pessoa_id uuid, nome text, papel_projeto text)
language plpgsql stable security definer set search_path to ''
as $function$
begin
  if not ((select public.is_admin()) or (select public.is_project_host(p_projeto_id))) then
    return;
  end if;
  return query
    select me.pessoa_id, coalesce(nullif(btrim(p.nome_publico), ''), '') as nome, me.papel_projeto::text
    from public.membro_equipe me
    left join public.perfil p on p.user_id = me.pessoa_id
    where me.projeto_id = p_projeto_id and me.deleted_at is null
    order by me.papel_projeto;
end; $function$;

-- ── Grants (revoke anon explícito — default privileges do hospedado concedem anon em função nova) ──
revoke all on function public.equipe_gestao(uuid) from public;
grant execute on function public.equipe_gestao(uuid) to authenticated;
revoke execute on function public.equipe_gestao(uuid) from anon;
revoke all on function public.eleger_host(uuid, uuid) from public;
revoke all on function public.reabrir_indicacoes(uuid) from public;
revoke all on function public.remover_membro(uuid, uuid) from public;
grant execute on function public.eleger_host(uuid, uuid) to authenticated;
grant execute on function public.reabrir_indicacoes(uuid) to authenticated;
grant execute on function public.remover_membro(uuid, uuid) to authenticated;
revoke execute on function public.eleger_host(uuid, uuid) from anon;
revoke execute on function public.reabrir_indicacoes(uuid) from anon;
revoke execute on function public.remover_membro(uuid, uuid) from anon;
-- re-afirma grants das RPCs recriadas (CREATE OR REPLACE preserva, mas garantimos o estado)
revoke execute on function public.fechar_equipe(uuid, uuid, jsonb) from anon;
revoke execute on function public.indicacoes_coordenador(uuid) from anon;
grant execute on function public.fechar_equipe(uuid, uuid, jsonb) to authenticated;
grant execute on function public.indicacoes_coordenador(uuid) to authenticated;
