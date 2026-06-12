-- Migração 0005 — Policies RLS da matriz de visibilidade (architecture.md §5; RN6–RN13)
-- Padrão: deny-by-default + `to ... explícito` + own/scope + OR is_admin (override auditado).

-- perfil: lê/edita o PRÓPRIO (mesmo NÃO verificado) — RN25 deixa perfil livre
create policy perfil_select on public.perfil for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy perfil_update on public.perfil for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
-- usuário NÃO pode auto-verificar: tira o UPDATE de tabela e concede só as colunas editáveis.
-- (revoke por coluna não subtrai de um grant de tabela; por isso removemos o de tabela primeiro.)
revoke update on public.perfil from anon, authenticated;
grant update (nome_publico, avatar_url, ranking_optin) on public.perfil to authenticated;
-- verificado_em fica sem privilégio de update p/ app → só muda via RPC verificar_conta (0006, definer)

-- papel_usuario: lê os próprios papéis; escrita de vínculo só admin (RPC assumir_papel é definer)
create policy papel_usuario_select on public.papel_usuario for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy papel_usuario_admin_write on public.papel_usuario for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- admin_app: lê o próprio status; escrita só admin (anti-escalonamento RN11)
create policy admin_app_select on public.admin_app for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy admin_app_admin_write on public.admin_app for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- curso: catálogo público (RN9); escrita só admin
create policy curso_select_pub on public.curso for select to anon, authenticated
  using (deleted_at is null or (select public.is_admin()));
create policy curso_admin_write on public.curso for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- coordenador_curso: lê próprio vínculo + admin; escrita de vínculo só admin
create policy coordenador_curso_select on public.coordenador_curso for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy coordenador_curso_admin_write on public.coordenador_curso for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- membro_empresa: lê próprio vínculo + admin; escrita só admin (self-insert via RPC definer na 004/onboarding)
create policy membro_empresa_select on public.membro_empresa for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy membro_empresa_admin_write on public.membro_empresa for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
