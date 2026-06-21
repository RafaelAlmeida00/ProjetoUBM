-- 0066 — Tabela assinatura (E18) + idempotência por origem + RLS espelhando o documento
--
-- Ciclo de vida da assinatura 1:1 com documento_proposta. Dois caminhos (RN7b):
--   A) origem='autentique'  — provedor_doc_id é a chave de idempotência (RN10/CA7)
--   B) origem='upload_livre'— chave é o proprio documento_id (UNIQUE — CA25)
--
-- Idempotência:
--   - UNIQUE(documento_id)  → garante exatamente 1 assinatura por documento (1:1 — cobre B)
--   - índice parcial uq_assinatura_autentique → evita duplicata por provedor_doc_id no Caminho A
--
-- RLS: SELECT = visibilidade do documento (join em documento_proposta).
--      INSERT/UPDATE: só via RPC SECURITY DEFINER (sem policy de escrita a authenticated).
--
-- Depende de: 0064 (enums), 0065 (documento_proposta), 0008 (audit — não aplicado aqui,
--             assinatura é gerida só por RPC auditada)
--
-- Rollback:
--   drop index if exists public.uq_assinatura_autentique;
--   drop table if exists public.assinatura;

create table public.assinatura (
  id              uuid        primary key default gen_random_uuid(),
  -- 1:1 com documento_proposta (UNIQUE garante idempotência Caminho B — CA25)
  documento_id    uuid        not null unique references public.documento_proposta(id) on delete cascade,
  origem          public.origem_assinatura not null,
  -- Caminho A: chave de idempotência vinda do Autentique (nullable: pendente antes de criar_pedido)
  provedor_doc_id text,
  -- signatário = representante da empresa da dor (nunca admin — RN3/CA9)
  signatario_id   uuid        not null references auth.users(id),
  status          public.status_assinatura not null default 'pendente',
  -- hash SHA-256 do PDF assinado (preenchido na confirmação)
  hash_sha256     text,
  assinado_em     timestamptz,
  -- IP/timestamp/e-mail do signatário (Caminho A); mínimo (Caminho B) — RS17 sem PII excedente
  evidencias      jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Idempotência Caminho A: (provedor_doc_id) único quando origem='autentique' e não-null (RN10/CA7)
-- Reentrega de webhook com mesmo provedor_doc_id => conflito => no-op (handler trata).
create unique index uq_assinatura_autentique
  on public.assinatura (provedor_doc_id)
  where origem = 'autentique' and provedor_doc_id is not null;

-- RLS: enable + force (deny-by-default — RS1)
alter table public.assinatura enable  row level security;
alter table public.assinatura force   row level security;

-- ── SELECT: mesma visibilidade do documento (join em documento_proposta) ─────────
-- Vê: admin OU representante da empresa OU coordenação do projeto (host+co-coord).
-- Aluno NÃO vê; anon NUNCA vê; sem policy anon => negado (RS1/RS2).
-- INSERT/UPDATE: apenas via RPC SECURITY DEFINER (sem policy de escrita — RS5).
create policy assinatura_select_restrita
  on public.assinatura
  for select
  to authenticated
  using (
    exists (
      select 1 from public.documento_proposta dp
      where dp.id = assinatura.documento_id
        and dp.deleted_at is null
        and (
          (select public.is_admin())
          or (select public.is_company_rep(dp.empresa_id))
          or (select public.is_project_coordinator(dp.projeto_id))
        )
    )
  );

-- SEM policy anon         => negado (RS1).
-- SEM policy INSERT/UPDATE => authenticated não escreve diretamente (RS5).
