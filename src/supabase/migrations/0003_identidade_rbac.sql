-- Migração 0003 — identidade / RBAC (architecture.md §3.2)
-- Tabelas com RLS enable+force (deny-by-default); POLICIES vêm na 0005 (após helpers da 0004).
-- Convenções herdadas da 0001: FK de pessoa -> auth.users(id) on delete cascade; PT-BR.

-- E2: perfil de aplicação + opt-in LGPD (RN13) + flag de verificação (RN24/RN25)
create table public.perfil (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  nome_publico  text,
  avatar_url    text,
  ranking_optin boolean not null default false,
  verificado_em timestamptz,                 -- null = NÃO verificado (gate RN25)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- E3: papéis-base acumuláveis (RN1/RN5)
create table public.papel_usuario (
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- E4: flag admin separada do papel (RN2)
create table public.admin_app (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- E5: curso UBM (escopo do coordenador, RN3) — reusa enum curso_ubm da 0001
create table public.curso (
  id         uuid primary key default gen_random_uuid(),
  slug       curso_ubm not null,
  nome       text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);
create unique index curso_slug_uniq on public.curso (slug) where deleted_at is null;

-- E6: scope coordenador <-> curso (1:N flexível; default 1 — RN3)
create table public.coordenador_curso (
  user_id    uuid not null references auth.users(id) on delete cascade,
  curso_id   uuid not null references public.curso(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, curso_id)
);
create index coordenador_curso_curso_idx on public.coordenador_curso (curso_id);

-- E8: scope representante <-> empresa (RN4). FK p/ public.empresa adicionada na 003 (nota de fronteira).
create table public.membro_empresa (
  user_id    uuid not null references auth.users(id) on delete cascade,
  empresa_id uuid not null,
  papel      papel_empresa not null default 'representante',
  created_at timestamptz not null default now(),
  primary key (user_id, empresa_id)
);
create index membro_empresa_empresa_idx on public.membro_empresa (empresa_id);

-- RLS enable+force em TODAS (deny-by-default; policies na 0005)
alter table public.perfil            enable row level security; alter table public.perfil            force row level security;
alter table public.papel_usuario     enable row level security; alter table public.papel_usuario     force row level security;
alter table public.admin_app         enable row level security; alter table public.admin_app         force row level security;
alter table public.curso             enable row level security; alter table public.curso             force row level security;
alter table public.coordenador_curso enable row level security; alter table public.coordenador_curso force row level security;
alter table public.membro_empresa    enable row level security; alter table public.membro_empresa    force row level security;
