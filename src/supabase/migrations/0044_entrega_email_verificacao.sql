-- Migração 0044 — Entrega de e-mail de verificação (Resend via edge function) + auto-disparo
-- Não muda regra de negócio: LIGA a entrega que faltava. A lógica de publicar-ao-verificar
-- (trigger perfil_verificacao_destrava_dor, 0018) e o token (0006) já existem.
-- Reusa: 0006 (emitir_token_verificacao/verificar_conta), 0010 (fila.email_outbox/notificacao).

-- ═══════════════════════════════════════════════════════════════════════════════
-- (1) status 'processando' + ultimo_erro p/ claim atômico do worker
-- ═══════════════════════════════════════════════════════════════════════════════
alter table fila.email_outbox drop constraint if exists email_outbox_status_check;
alter table fila.email_outbox
  add constraint email_outbox_status_check
    check (status in ('pendente','processando','enviado','falhou'));
alter table fila.email_outbox add column if not exists ultimo_erro text;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (2) solicitar_verificacao_email — emite token (0006) + enfileira e-mail com o link
-- ═══════════════════════════════════════════════════════════════════════════════
-- p_forcar=false: só envia se NÃO há token pendente válido (idempotente no login repetido).
-- p_forcar=true: reenvio manual (/app/conta), respeitando o rate-limit da 0006.
-- Já verificado → no-op. Anti-spam: 1 e-mail por token (idempotência por hash do token).
-- Entrega via Next server (Resend SDK), não via outbox. Retorna o link p/ o servidor enviar.
create or replace function public.solicitar_verificacao_email(
  p_base_url text,
  p_forcar   boolean default false
) returns table(enviar boolean, destinatario text, link text, nome text)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email text;
  v_nome  text;
  v_token text;
  v_verif timestamptz;
begin
  if v_uid is null then raise exception 'sessao necessaria'; end if;

  select verificado_em into v_verif from public.perfil where user_id = v_uid;
  if v_verif is not null then
    return query select false, null::text, null::text, null::text; return;  -- já verificado
  end if;

  if not p_forcar and exists (
    select 1 from public.verificacao_token
     where user_id = v_uid and usado_em is null and expira_em > now()
  ) then
    return query select false, null::text, null::text, null::text; return;  -- token pendente
  end if;

  select email into v_email from auth.users where id = v_uid;
  if v_email is null then return query select false, null::text, null::text, null::text; return; end if;
  select coalesce(nome_publico, split_part(v_email, '@', 1)) into v_nome
    from public.perfil where user_id = v_uid;

  -- Emite o token (rate-limit + invalida pendentes — lógica da 0006)
  v_token := public.emitir_token_verificacao();

  -- Notificação in-app
  insert into public.notificacao (destinatario_id, tipo, payload)
  values (v_uid, 'verificacao_conta', jsonb_build_object('nome', coalesce(v_nome, '')));

  return query select true, v_email,
    rtrim(p_base_url, '/') || '/auth/verify?token=' || v_token, coalesce(v_nome, '');
end; $$;
grant execute on function public.solicitar_verificacao_email(text, boolean) to authenticated;

-- NOTA: drenar/marcar + fila.email_outbox ficam como INFRA ASSÍNCRONA DORMENTE (não usadas
-- pela verificação, que envia direto via Next/Resend). Mantidas p/ futuro worker de notificações.

-- ═══════════════════════════════════════════════════════════════════════════════
-- (3) RPCs do worker (service_role) — sem expor o schema fila ao PostgREST
-- ═══════════════════════════════════════════════════════════════════════════════
-- Claim atômico: marca 'processando' com FOR UPDATE SKIP LOCKED (sem dupla entrega).
create or replace function public.drenar_emails_pendentes(p_limite int default 20)
returns setof fila.email_outbox
language plpgsql security definer set search_path = '' as $$
begin
  return query
  update fila.email_outbox o
     set status = 'processando'
   where o.id in (
     select e.id from fila.email_outbox e
      where e.status = 'pendente' and e.proxima_tentativa_em <= now()
      order by e.created_at
      limit p_limite
      for update skip locked
   )
  returning o.*;
end; $$;
revoke all on function public.drenar_emails_pendentes(int) from public, anon, authenticated;
grant execute on function public.drenar_emails_pendentes(int) to service_role;

-- Marca resultado: enviado | falha com backoff quadrático (cap 60min, 5 tentativas → falhou).
create or replace function public.marcar_email_resultado(
  p_id uuid, p_ok boolean, p_erro text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_tent int;
begin
  if p_ok then
    update fila.email_outbox set status = 'enviado', enviado_em = now() where id = p_id;
  else
    select tentativas + 1 into v_tent from fila.email_outbox where id = p_id;
    update fila.email_outbox
       set status               = case when v_tent >= 5 then 'falhou' else 'pendente' end,
           tentativas           = v_tent,
           ultimo_erro          = left(coalesce(p_erro, ''), 500),
           proxima_tentativa_em = now() + (least(v_tent * v_tent, 60) || ' minutes')::interval
     where id = p_id;
  end if;
end; $$;
revoke all on function public.marcar_email_resultado(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.marcar_email_resultado(uuid, boolean, text) to service_role;
