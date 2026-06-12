-- Migração 0047 — onboarding_aluno aceita SLUGS (curso_ubm) + seed do catálogo de cursos
-- BUG (logs 2026-06-11): o front envia os slugs do enum curso_ubm (ex.: 'engenharia_de_software')
-- como p_curso_ids uuid[] → "invalid input syntax for type uuid" → onboarding_aluno 400 → loop.
-- A tabela curso mapeia slug (curso_ubm) ↔ id (uuid) ↔ nome. Resolvemos o slug→id NO BANCO.

-- NOTA: o SEED do catálogo de cursos UBM NÃO fica nesta migração — seed em migração
-- polui fixtures de teste (0004/0005/0009/0027 assumem catálogo limpo). O catálogo é
-- DADO semeado no Supabase hospedado (aplicado fora da migração). Ver decisions.log.

-- onboarding_aluno: aceita slugs do enum e resolve para curso.id (slug não-mapeado é ignorado).
drop function if exists public.onboarding_aluno(text, uuid[]);
create or replace function public.onboarding_aluno(p_nome text, p_curso_slugs public.curso_ubm[])
returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'sessao necessaria'; end if;
  insert into public.papel_usuario (user_id, role)
  values (v_uid, 'aluno')
  on conflict do nothing;
  if p_curso_slugs is not null then
    insert into public.aluno_curso (user_id, curso_id)
    select v_uid, c.id
      from public.curso c
     where c.slug = any(p_curso_slugs) and c.deleted_at is null
    on conflict do nothing;   -- 'nao_sei' e slugs sem curso são ignorados
  end if;
  insert into public.perfil (user_id, nome_publico)
  values (v_uid, p_nome)
  on conflict (user_id)
  do update set
    nome_publico = coalesce(excluded.nome_publico, public.perfil.nome_publico),
    updated_at   = now();
end; $$;
grant execute on function public.onboarding_aluno(text, public.curso_ubm[]) to authenticated;
