-- 0065 — Tabela documento_proposta (E17) + RLS restrita (RS1/RS2)
--
-- Armazena o documento privado da proposta: PDF original (e após assinatura, o assinado)
-- + manifesto de auditoria + empresa da dor (visibilidade representante).
-- INSERT/UPDATE só via RPC SECURITY DEFINER (nenhuma policy de escrita para authenticated).
-- SELECT restrito: host/co-coordenação do projeto + representante da empresa + admin (RN5/RN18/CA18).
-- Aluno NÃO vê. Anônimo NUNCA vê (sem policy anon => negado — RS1).
--
-- Depende de: 0064 (enums assinatura), 0030 (projeto), 0011 (empresa), 0004 (helpers),
--             0031 (is_project_coordinator/is_project_host), 0008 (audit.gravar_versao)
--
-- Rollback:
--   drop trigger if exists zzz_audit on public.documento_proposta;
--   drop table if exists public.documento_proposta;

create table public.documento_proposta (
  id                     uuid        primary key default gen_random_uuid(),
  projeto_id             uuid        not null references public.projeto(id) on delete restrict,
  tipo                   public.tipo_documento not null default 'proposta',
  empresa_id             uuid        not null references public.empresa(id),
  -- o HOST que enviou o documento
  enviado_por            uuid        not null references auth.users(id),
  -- bucket privado 'propostas': caminho do original
  storage_path_original  text        not null,
  -- preenchido na confirmação/aceitação (Caminho A: manifesto; Caminho B: só path)
  storage_path_assinado  text,
  -- manifesto de auditoria Autentique (Caminho A); NULL no Caminho B (RN11)
  manifesto_auditoria    jsonb,
  -- marcado na contraproposta para rejeitar uploads tardios de versão obsoleta (RN16)
  superado_em            timestamptz,
  -- auditoria padrão
  created_at             timestamptz not null default now(),
  created_by             uuid        not null references auth.users(id),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz,
  deleted_by             uuid        references auth.users(id)
);

-- Índices
create index ix_docprop_projeto on public.documento_proposta (projeto_id) where deleted_at is null;
create index ix_docprop_empresa on public.documento_proposta (empresa_id);

-- RLS: enable + force (deny-by-default — RS1)
alter table public.documento_proposta enable  row level security;
alter table public.documento_proposta force   row level security;

-- Auditoria (padrão zzz_audit)
create trigger zzz_audit
  after insert or update or delete on public.documento_proposta
  for each row execute function audit.gravar_versao();

-- ── SELECT restrito (RN5/RN18/CA18 — RS2) ──────────────────────────────────────
-- Vê: admin OU representante da empresa (is_company_rep) OU coordenação do projeto
--     (is_project_coordinator = host + co-coordenadores; aluno NÃO entra aqui).
-- Não vê: aluno da equipe, terceiro, anon.
-- INSERT/UPDATE: apenas via RPC SECURITY DEFINER (sem policy de escrita a authenticated).
create policy documento_select_restrito
  on public.documento_proposta
  for select
  to authenticated
  using (
    deleted_at is null
    and (
      (select public.is_admin())
      or (select public.is_company_rep(empresa_id))
      or (select public.is_project_coordinator(projeto_id))
    )
  );

-- SEM policy para anon       => negado (fail-closed — RS1).
-- SEM policy INSERT/UPDATE   => autenticados não escrevem diretamente (RS5).
