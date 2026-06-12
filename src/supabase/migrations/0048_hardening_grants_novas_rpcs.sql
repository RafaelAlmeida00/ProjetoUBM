-- Migração 0048 — hardening: revoga execute PUBLIC/anon das RPCs novas (SR-A-H2 / RS-ID9)
-- BUG: ao criar funções nas 0044/0045/0047, dei `grant ... to authenticated` mas NÃO revoguei
-- o EXECUTE que o Postgres concede a PUBLIC por padrão. Resultado: solicitar_verificacao_email,
-- marcar_verificado_oauth e onboarding_aluno ficaram executáveis por anon/PUBLIC (gatilho interno
-- de auth.uid() impede abuso, mas viola a matriz de grants — defesa em profundidade).
-- A suíte de segurança (0027 RS-ID9, 0040/0042 varredura SR-A-H2) pega isso corretamente.

revoke execute on function public.solicitar_verificacao_email(text, boolean) from public, anon;
revoke execute on function public.marcar_verificado_oauth() from public, anon;
revoke execute on function public.onboarding_aluno(text, public.curso_ubm[]) from public, anon;

-- Garante o grant ao papel correto (idempotente — só authenticated)
grant execute on function public.solicitar_verificacao_email(text, boolean) to authenticated;
grant execute on function public.marcar_verificado_oauth() to authenticated;
grant execute on function public.onboarding_aluno(text, public.curso_ubm[]) to authenticated;
