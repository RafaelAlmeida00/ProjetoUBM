-- Migração 0073 — triggers de notificação da feature 006 (proposta/assinatura)
-- spec: RN24 / CA21 / CA22 · RS17 · arch §4.7
-- Depende de: 0010 (criar_notificacao/tipo_notificacao), 0065 (documento_proposta),
--             0066 (assinatura), 0067 (contraproposta), 0030 (projeto), 0033 (membro_equipe)
--
-- Gatilhos (reutilizam tipo_notificacao existente — SEM ALTER TYPE):
--   (a) AFTER INSERT assinatura      → 'proposta_recebida'  ao representante (RN24a)
--   (b) AFTER UPDATE assinatura      → 'proposta_assinada'  ao host + equipe  (RN24b)
--   (b2) AFTER UPDATE assinatura     → 'status_mudou{proposta_recusada}' ao host (RN24d)
--   (c) AFTER INSERT contraproposta  → 'contraproposta'     ao host (motivo FORA do payload — CA21)
--
-- Todos FAIL-SOFT (padrão 0037): erro de notificação não regride a transação.
-- Payload SEM PII excedente (RS17): sem motivo, sem email, sem nome.
--
-- NOTA: mudanças de estado do projeto já disparam 'status_mudou{projeto_avancou}' à equipe
-- via trigger _projeto_notificar (0037). Não duplicamos aqui.
--
-- Rollback:
--   drop trigger if exists assinatura_notificar_recusa    on public.assinatura;
--   drop trigger if exists assinatura_notificar_aprovacao on public.assinatura;
--   drop trigger if exists assinatura_notificar_envio     on public.assinatura;
--   drop trigger if exists contraproposta_notificar_host  on public.contraproposta;
--   drop function if exists public._contraproposta_notificar_host();
--   drop function if exists public._assinatura_notificar_aprovacao();
--   drop function if exists public._assinatura_notificar_envio();

-- ── (a) Proposta enviada → representante recebe 'proposta_recebida' ───────────
-- Trigger: AFTER INSERT em assinatura (criada ao enviar_proposta).
-- O signatario_id da assinatura É o representante (CA9 — garantido pela RPC enviar_proposta).
-- Payload: projeto_id + documento_id (sem PII — RS17).
create or replace function public._assinatura_notificar_envio()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_projeto_id uuid;
begin
  -- Obtém projeto_id via documento_proposta
  select d.projeto_id into v_projeto_id
    from public.documento_proposta d
   where d.id = new.documento_id;

  -- Notifica o signatário (= representante) que recebeu a proposta (RN24a)
  perform public.criar_notificacao(
    new.signatario_id,
    'proposta_recebida',
    jsonb_build_object(
      'evento',       'proposta_recebida',
      'projeto_id',   v_projeto_id::text,
      'documento_id', new.documento_id::text
    )
  );
  return new;
exception when others then
  return new; -- fail-soft: erro de notificação não impede a inserção da assinatura
end; $$;

-- Grants: trigger fn — nenhum grant de app role
revoke all on function public._assinatura_notificar_envio() from public, anon, authenticated;

create trigger assinatura_notificar_envio
  after insert on public.assinatura
  for each row execute function public._assinatura_notificar_envio();

-- ── (b) Assinatura confirmada → host + equipe recebem 'proposta_assinada' ─────
-- ── (b2) Assinatura recusada/expirada → host recebe 'status_mudou{proposta_recusada|proposta_expirada}'
-- Trigger: AFTER UPDATE em assinatura (status muda de 'enviada' para 'assinada'/'recusada'/'expirada').
-- Busca host via projeto.host_coordenador_id; equipe via membro_equipe.
create or replace function public._assinatura_notificar_aprovacao()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_projeto_id uuid;
  v_host_id    uuid;
  v_membro     uuid;
begin
  -- Só age quando status muda (evita chamadas desnecessárias)
  if new.status = old.status then return new; end if;

  -- Obtém projeto_id e host via documento_proposta → projeto
  select d.projeto_id, pj.host_coordenador_id
    into v_projeto_id, v_host_id
    from public.documento_proposta d
    join public.projeto pj on pj.id = d.projeto_id
   where d.id = new.documento_id;

  -- (b) Assinatura confirmada → notifica host + membros da equipe (RN24b)
  if new.status = 'assinada' then
    -- Notifica o host
    if v_host_id is not null then
      begin
        perform public.criar_notificacao(
          v_host_id,
          'proposta_assinada',
          jsonb_build_object(
            'evento',       'proposta_assinada',
            'projeto_id',   v_projeto_id::text,
            'documento_id', new.documento_id::text
          )
        );
      exception when others then null; -- fail-soft individual
      end;
    end if;

    -- Notifica todos os membros da equipe (exceto host — já notificado acima)
    for v_membro in
      select pessoa_id from public.membro_equipe
       where projeto_id = v_projeto_id
         and deleted_at is null
         and pessoa_id <> coalesce(v_host_id, '00000000-0000-0000-0000-000000000000'::uuid)
    loop
      begin
        perform public.criar_notificacao(
          v_membro,
          'proposta_assinada',
          jsonb_build_object(
            'evento',       'proposta_assinada',
            'projeto_id',   v_projeto_id::text
          )
        );
      exception when others then null; -- fail-soft individual
      end;
    end loop;

  -- (b2) Recusa ou expiração → notifica o host (RN24d)
  elsif new.status in ('recusada', 'expirada') then
    if v_host_id is not null then
      begin
        perform public.criar_notificacao(
          v_host_id,
          'status_mudou',
          jsonb_build_object(
            'evento',       case new.status
                              when 'recusada'  then 'proposta_recusada'
                              when 'expirada'  then 'proposta_expirada'
                              else                  'proposta_status_mudou'
                            end,
            'projeto_id',   v_projeto_id::text,
            'documento_id', new.documento_id::text
          )
        );
      exception when others then null; -- fail-soft individual
      end;
    end if;
  end if;

  return new;
exception when others then
  return new; -- fail-soft de topo: garante que a transação não regride
end; $$;

-- Grants: trigger fn — nenhum grant de app role
revoke all on function public._assinatura_notificar_aprovacao() from public, anon, authenticated;

create trigger assinatura_notificar_aprovacao
  after update of status on public.assinatura
  for each row execute function public._assinatura_notificar_aprovacao();

-- ── (c) Contraproposta → host recebe 'contraproposta' (motivo FORA do payload) ─
-- Trigger: AFTER INSERT em contraproposta.
-- CRÍTICO (CA21/RN19/RS17): payload NÃO contém o motivo (sensível — RN14/RN19).
-- O motivo fica somente em contraproposta.motivo, visível via RLS restrita.
create or replace function public._contraproposta_notificar_host()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_host_id uuid;
begin
  -- Obtém o host do projeto
  select host_coordenador_id into v_host_id
    from public.projeto
   where id = new.projeto_id;

  -- Notifica o host (RN24c) — motivo FORA do payload (CA21/RN19)
  if v_host_id is not null then
    perform public.criar_notificacao(
      v_host_id,
      'contraproposta',
      jsonb_build_object(
        'evento',            'contraproposta_recebida',
        'projeto_id',        new.projeto_id::text,
        'contraproposta_id', new.id::text
        -- INTENCIONALMENTE sem 'motivo' (CA21/RN19/RS17)
      )
    );
  end if;
  return new;
exception when others then
  return new; -- fail-soft: erro de notificação não impede a inserção da contraproposta
end; $$;

-- Grants: trigger fn — nenhum grant de app role
revoke all on function public._contraproposta_notificar_host() from public, anon, authenticated;

create trigger contraproposta_notificar_host
  after insert on public.contraproposta
  for each row execute function public._contraproposta_notificar_host();
