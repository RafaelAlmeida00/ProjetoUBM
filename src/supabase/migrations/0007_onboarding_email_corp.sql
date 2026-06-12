-- Migração 0007 — onboarding de papel + regra de e-mail corporativo (architecture.md §7.1; RN21/RN22/RN23)

-- Denylist de provedores genéricos (server-only: não expor a lista — RS6). Configurável.
create table public.dominio_email_bloqueado (dominio text primary key);
alter table public.dominio_email_bloqueado enable row level security;
alter table public.dominio_email_bloqueado force  row level security;
revoke all on public.dominio_email_bloqueado from anon, authenticated;
insert into public.dominio_email_bloqueado (dominio) values
  ('gmail.com'), ('googlemail.com'), ('hotmail.com'), ('outlook.com'), ('live.com'),
  ('msn.com'), ('yahoo.com'), ('yahoo.com.br'), ('icloud.com'), ('me.com'),
  ('proton.me'), ('protonmail.com'), ('uol.com.br'), ('bol.com.br'), ('terra.com.br');

-- e-mail é corporativo se o domínio NÃO está na denylist (validação server-side, RN22)
create or replace function public.is_email_corporativo(p_email text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_email is not null
     and position('@' in p_email) > 0
     and not exists (
       select 1 from public.dominio_email_bloqueado d
       where d.dominio = lower(split_part(p_email, '@', 2))
     );
$$;

-- assume um papel-base (acumulável); representante exige e-mail corporativo do OAuth.
create or replace function public.assumir_papel(p_role public.app_role)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email text := (select auth.jwt() ->> 'email');
begin
  if v_uid is null then raise exception 'sessao necessaria'; end if;
  if p_role = 'representante' and not public.is_email_corporativo(v_email) then
    raise exception 'representante exige e-mail corporativo';                 -- CA23
  end if;
  insert into public.papel_usuario (user_id, role) values (v_uid, p_role)
    on conflict do nothing;                                                   -- acumulável (RN1/RN5)
end; $$;

grant execute on function public.assumir_papel(public.app_role) to authenticated;
