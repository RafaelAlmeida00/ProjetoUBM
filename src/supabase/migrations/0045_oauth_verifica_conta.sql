-- Migração 0045 — OAuth login = conta verificada (decisão do cliente, orçamento $0, sem domínio)
-- O login Google já prova posse do e-mail (Google confirma o endereço) → satisfaz a verificação
-- que a A1/RN9 exige. Marca perfil.verificado_em no login; o trigger 0018 publica as dores
-- aprovadas do autor. Substitui o e-mail de verificação (que exigiria domínio Resend pago).

-- RPC chamada pela callback do OAuth: marca a conta verificada (idempotente, own-only).
create or replace function public.marcar_verificado_oauth()
returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'sessao necessaria'; end if;
  -- Garante o perfil e marca verificado_em (mantém se já existia — coalesce).
  -- O UPDATE de verificado_em dispara o trigger perfil_verificacao_destrava_dor (0018).
  insert into public.perfil (user_id, verificado_em)
  values (v_uid, now())
  on conflict (user_id) do update
    set verificado_em = coalesce(public.perfil.verificado_em, now()),
        updated_at    = now()
  where public.perfil.verificado_em is null;  -- só toca se ainda não verificado
  return true;
end; $$;
grant execute on function public.marcar_verificado_oauth() to authenticated;
