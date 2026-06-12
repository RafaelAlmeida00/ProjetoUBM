-- Migração 0001 — proposta de dor (Plataforma UBM)
-- Modelo de dados: architecture.md §11 · Controles RLS: security.md §6
-- Princípio: RLS é o controle central (deny-by-default; dono insere/lê só o próprio).

-- Enum fechado de cursos (espelha workspace/src/lib/courses.ts / spec §9 + "nao_sei") — RN4
create type curso_ubm as enum (
  'administracao','biomedicina','ciencias_contabeis','direito','educacao_fisica',
  'enfermagem','engenharia_civil','engenharia_de_software','engenharia_eletrica',
  'engenharia_mecanica','farmacia','fisioterapia','medicina_veterinaria','musica',
  'nutricao','psicologia','terapia_ocupacional','nao_sei'
);

create table public.proposal (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade, -- dono (RLS)
  email         text not null,                       -- do OAuth (servidor) — RN2/AC5
  rep_nome      text not null,                       -- RN3
  empresa       text not null,                       -- RN3
  departamento  text,                                -- opcional
  cargo         text,                                -- opcional
  dor           text not null,                       -- RN3
  cursos        curso_ubm[] not null default '{}',   -- RN4
  consent       boolean not null,                    -- RN5/AC8
  consent_version text not null,                     -- versão do termo aceito
  consent_at    timestamptz not null,                -- evidência de consentimento
  created_at    timestamptz not null default now(),
  constraint dor_nao_vazia check (length(btrim(dor)) > 0),
  constraint consent_obrigatorio check (consent = true)
);

-- RLS: habilitar E forçar (não bypassar nem pelo owner da tabela) — E-01/E-02
alter table public.proposal enable row level security;
alter table public.proposal force row level security;

-- INSERT: usuário autenticado só grava a PRÓPRIA proposta e com consentimento — S-01/T-02/RS4
create policy "proposal_insert_own"
  on public.proposal for insert to authenticated
  with check (user_id = auth.uid() and consent = true);

-- SELECT: só as próprias linhas (anti-IDOR I-01)
create policy "proposal_select_own"
  on public.proposal for select to authenticated
  using (user_id = auth.uid());

-- UPDATE: só as próprias; impede troca de dono
create policy "proposal_update_own"
  on public.proposal for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- DELETE: titular pode eliminar a própria proposta (direito LGPD — RS13)
create policy "proposal_delete_own"
  on public.proposal for delete to authenticated
  using (user_id = auth.uid());

-- Sem policy para o papel `anon` => acesso negado por padrão (fail-closed).
