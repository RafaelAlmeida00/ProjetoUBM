-- Migração 0015 — enum status_dor + tabela public.dor + RLS por estado (feature 004)
-- architecture.md §2.2/§2.7; spec §7 CA1/CA17/CA18/CA19; security.md RS-D1/RS-D2/RS-D3.
-- Depende de: 0011 (empresa), 0004 (helpers is_admin/esta_verificado/is_company_rep), 0008 (audit).

-- Enum fechado de estados da dor (RN1). DEFAULT rascunho.
create type public.status_dor as enum ('rascunho', 'em_moderacao', 'publicada', 'rejeitada');

-- Tabela principal da dor (E10 — evolução da proposal). Sem coluna de empresa em texto livre (RN6).
create table public.dor (
  id               uuid primary key default gen_random_uuid(),

  -- Autoria e vínculo (RN5/RN6)
  autor_id         uuid not null references auth.users(id) on delete cascade,
  empresa_id       uuid references public.empresa(id),  -- nullable em rascunho; NOT NULL exigido no submit (0018)

  -- Ciclo de vida (RN1)
  status_dor       public.status_dor not null default 'rascunho',

  -- Conteúdo (PII — erasure alcança na 0020)
  descricao        text not null check (length(btrim(descricao)) > 0),
  rep_nome         text not null,
  departamento     text,
  cargo            text,

  -- Consentimento LGPD (RN7 — preservado na erasure como marca legal)
  consentimento    boolean not null default false,
  consent_version  text,
  consent_at       timestamptz,

  -- Moderação (RN9/RN13): aprovado_por e aprovado_em são ATÔMICOS (nulos ou ambos presentes)
  aprovado_por     uuid references auth.users(id),
  aprovado_em      timestamptz,

  -- Rejeição (RN11)
  motivo_rejeicao  text,

  -- Publicação (RN9 — momento em que A1 se satisfez)
  publicada_em     timestamptz,

  -- Auditoria/soft-delete (RN20/ADR-0007)
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  deleted_by       uuid references auth.users(id),

  -- Constraints de intenção (architecture §2.2)
  -- Rejeição exige motivo (RN11/CA8)
  constraint dor_rejeitada_exige_motivo
    check (status_dor <> 'rejeitada' or motivo_rejeicao is not null),
  -- Publicada exige aprovado_por + publicada_em (parte da A1 — arch §2.5)
  constraint dor_publicada_exige_aprovacao
    check (status_dor <> 'publicada' or (aprovado_por is not null and publicada_em is not null)),
  -- Aprovação é atômica: aprovado_por e aprovado_em nulos OU ambos não-nulos (arch §2.2)
  constraint dor_aprovacao_atomica
    check ((aprovado_por is null) = (aprovado_em is null))
);

-- Índices para performance de RLS e consultas frequentes (architecture §2.2/§6)
create index dor_status_idx       on public.dor (status_dor);
create index dor_autor_idx        on public.dor (autor_id);
create index dor_empresa_idx      on public.dor (empresa_id);
-- Índice parcial: fila de moderação rápida
create index dor_fila_moderacao   on public.dor (status_dor) where status_dor = 'em_moderacao' and deleted_at is null;
-- Índice parcial: vitrine pública rápida
create index dor_vitrine_publicada on public.dor (status_dor) where status_dor = 'publicada' and deleted_at is null;

-- RLS enable+force (RS-D1 — deny-by-default, anti CVE-2025-48757)
alter table public.dor enable row level security;
alter table public.dor force  row level security;

-- Políticas por estado (architecture §2.7 / spec RN17/RN18)
-- SELECT: anon + authenticated veem só publicadas e não-deletadas (vitrine — RN17/CA17)
create policy dor_select_publica on public.dor for select to anon, authenticated
  using (status_dor = 'publicada' and deleted_at is null);

-- SELECT: autor vê as PRÓPRIAS em qualquer estado (RN18/CA18/CA19)
create policy dor_select_autor on public.dor for select to authenticated
  using (autor_id = (select auth.uid()));

-- SELECT: admin vê tudo para moderar/corrigir (RN18)
create policy dor_select_admin on public.dor for select to authenticated
  using ((select public.is_admin()));

-- INSERT: representante verificado — autor_id deve ser o próprio; gate de verificação (RN5/RN19)
-- Exceção da landing (submeter_dor_landing) é RPC SECURITY DEFINER — não precisa desta policy.
create policy dor_insert_autor on public.dor for insert to authenticated
  with check (
    autor_id = (select auth.uid())
    and (select public.esta_verificado())
  );

-- UPDATE: conteúdo — autor dono pode editar só em rascunho/rejeitada (RN5)
create policy dor_update_conteudo on public.dor for update to authenticated
  using (
    autor_id = (select auth.uid())
    and status_dor in ('rascunho', 'rejeitada')
    and (select public.esta_verificado())
  )
  with check (
    autor_id = (select auth.uid())
    and status_dor in ('rascunho', 'rejeitada')
  );

-- UPDATE: admin pode atualizar qualquer dor (moderação, correção — auditada)
create policy dor_update_admin on public.dor for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- DELETE (lógico): só admin soft-deleta de forma auditada
create policy dor_delete_admin on public.dor for delete to authenticated
  using ((select public.is_admin()));

-- Trigger de auditoria (RN20 — toda mutação registrada com ator e antes/depois)
create trigger zzz_audit after insert or update or delete on public.dor
  for each row execute function audit.gravar_versao();
