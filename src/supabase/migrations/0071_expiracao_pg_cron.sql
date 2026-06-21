-- 0071 — Job expirar_propostas() + agendamento pg_cron (RN17/CA15)
--
-- Para cada projeto em proposta_em_analise com assinatura em status 'enviada'
-- criada há >60 dias corridos:
--   - UPDATE assinatura → 'expirada'
--   - UPDATE projeto → 'aguardando_proposta' (guarda grava status_evento motivo='expiracao_60d')
--   - Notifica host (fail-soft)
--
-- pg_cron: agendado diariamente (guard de extensão — no-op se extensão ausente).
-- SECURITY DEFINER: roda como dono, sem sessão de usuário (equivale a superuser no PGlite;
-- no hospedado roda como dono da função com search_path restrito).
--
-- Depende de: 0064 (enums), 0065 (documento_proposta), 0066 (assinatura),
--             0068 (rodadas/alerta — colunas), 0069 (guarda atores reais),
--             0010 (criar_notificacao)
--
-- Rollback:
--   select cron.unschedule('expirar-propostas-60d');  -- se pg_cron disponível
--   drop function if exists public.expirar_propostas();

create or replace function public.expirar_propostas()
returns void language plpgsql security definer set search_path = '' as $$
declare
  rec record;
begin
  -- Localiza assinaturas enviadas há >60 dias em projetos ainda em proposta_em_analise
  for rec in
    select a.id        as assinatura_id,
           a.documento_id,
           d.projeto_id,
           pj.host_coordenador_id
      from public.assinatura a
      join public.documento_proposta d  on d.id  = a.documento_id
      join public.projeto             pj on pj.id = d.projeto_id
     where a.status      = 'enviada'
       and pj.status     = 'proposta_em_analise'
       and pj.deleted_at is null
       and d.deleted_at  is null
       and d.superado_em is null
       and a.created_at  < now() - interval '60 days'
  loop
    -- Marca assinatura como expirada
    update public.assinatura
       set status = 'expirada', updated_at = now()
     where id = rec.assinatura_id;

    -- Marca documento como superado (anti-upload tardio)
    update public.documento_proposta
       set superado_em = now(), updated_at = now()
     where id = rec.documento_id;

    -- Seta o motivo via GUC (lido pela guarda no INSERT de status_evento)
    perform set_config('app.transicao_motivo', 'expiracao_60d', true);

    -- UPDATE projeto → aguardando_proposta (guarda valida e grava status_evento)
    -- A guarda aceita a transição pois roda como SECURITY DEFINER (dono = superuser no PGlite;
    -- no hospedado o contexto é o dono da função, sem check de is_company_rep/is_project_host)
    update public.projeto
       set status = 'aguardando_proposta', updated_at = now()
     where id = rec.projeto_id and status = 'proposta_em_analise';

    -- Reseta a GUC após o UPDATE
    perform set_config('app.transicao_motivo', '', true);

    -- Notifica host (fail-soft — RS17: sem PII no payload)
    begin
      if rec.host_coordenador_id is not null then
        perform public.criar_notificacao(
          rec.host_coordenador_id, 'status_mudou',
          jsonb_build_object(
            'evento',      'proposta_expirada',
            'projeto_id',  rec.projeto_id::text
          )
        );
      end if;
    exception when others then null;
    end;
  end loop;
end; $$;

-- Grants: job interno — authenticated pode chamar (gate é interno); anon NUNCA (hardening 0072)
revoke all     on function public.expirar_propostas() from public, anon;
grant  execute on function public.expirar_propostas() to authenticated, service_role;

-- ── pg_cron: agendamento diário (guard de extensão — no-op no PGlite) ────────
do $cron_guard$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'expirar-propostas-60d',
      '0 3 * * *',   -- 03:00 UTC diariamente
      $job$ select public.expirar_propostas(); $job$
    );
  end if;
exception when others then null;  -- fail-soft se extensão presente mas schedule falha
end; $cron_guard$;
