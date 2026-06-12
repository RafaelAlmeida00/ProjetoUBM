-- Migração 0050 — RE-hardening dos grants das RPCs de escrita da 005 (defense-in-depth)
-- security.md 005 RS / hardening 0038.
-- PROBLEMA (evidência live, 2026-06-12): as 6 RPCs de escrita da 005 voltaram a ser
-- ANON-EXECUTÁVEIS no hospedado — um `create or replace function` posterior ao 0038
-- resetou os grants para o default PUBLIC. Os guards internos (gate verificação / is_admin /
-- host único) mitigam o impacto, mas defense-in-depth exige revogar anon/public.
-- Idempotente: revoke+grant podem ser reaplicados sem efeito colateral.

-- indicar_se(p_projeto_id uuid, p_papel_pretendido papel_pretendido, p_mensagem text)
revoke execute on function public.indicar_se(uuid, public.papel_pretendido, text) from public, anon;
grant  execute on function public.indicar_se(uuid, public.papel_pretendido, text) to authenticated;

-- retirar_indicacao(p_projeto_id uuid)
revoke execute on function public.retirar_indicacao(uuid) from public, anon;
grant  execute on function public.retirar_indicacao(uuid) to authenticated;

-- fechar_equipe(p_projeto_id uuid, p_host_pessoa_id uuid, p_membros jsonb)
revoke execute on function public.fechar_equipe(uuid, uuid, jsonb) from public, anon;
grant  execute on function public.fechar_equipe(uuid, uuid, jsonb) to authenticated;

-- avancar_projeto(p_projeto_id uuid)
revoke execute on function public.avancar_projeto(uuid) from public, anon;
grant  execute on function public.avancar_projeto(uuid) to authenticated;

-- trocar_host(p_projeto_id uuid, p_novo_host_pessoa_id uuid)
revoke execute on function public.trocar_host(uuid, uuid) from public, anon;
grant  execute on function public.trocar_host(uuid, uuid) to authenticated;

-- override_transicao(p_projeto_id uuid, p_novo_status status_projeto, p_motivo text)
revoke execute on function public.override_transicao(uuid, public.status_projeto, text) from public, anon;
grant  execute on function public.override_transicao(uuid, public.status_projeto, text) to authenticated;
