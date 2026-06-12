-- Migração 0024 — tabela public.paleta (E21) + CHECKs + índices + RLS + policies
--                  + trigger zzz_audit + seed das 2 oficiais (feature 007-theming-paletas)
-- Contrato: contracts/paleta.md §1 · architecture.md §5 · security.md RS-P*
-- Depende de: 0008 (audit.gravar_versao), 0011 (empresa), 0004 (is_admin)

-- ─── enum fechado de escopo ───────────────────────────────────────────────────
create type public.escopo_paleta as enum ('oficial', 'empresa');

-- ─── função de validação HSL (usada nos CHECKs abaixo) ───────────────────────
-- Valida um único valor de token: deve casar H S% L% com H∈[0,360], S,L∈[0,100].
-- Sem SECURITY DEFINER: são funções puras (immutable, sem acesso a dados privilegiados).
-- O revoke de execute from public é feito na 0025 para as RPCs de escrita;
-- estas helpers de CHECK precisam ser acessíveis pelo executor do INSERT/UPDATE.
create or replace function public._paleta_hsl_valido(v text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  h numeric; s numeric; l numeric;
  m text[];
begin
  -- Padrão: "NNN NNN% NNN%" (inteiro ou decimal, sem espaço interno no número)
  m := regexp_match(
    v,
    '^(\d{1,3}(?:\.\d+)?)\s+(\d{1,3}(?:\.\d+)?)%\s+(\d{1,3}(?:\.\d+)?)%$'
  );
  if m is null then return false; end if;
  h := m[1]::numeric;
  s := m[2]::numeric;
  l := m[3]::numeric;
  return h >= 0 and h <= 360 and s >= 0 and s <= 100 and l >= 0 and l <= 100;
end; $$;

-- Valida todos os valores de um jsonb de tokens:
-- (1) todas as chaves devem estar no conjunto fechado;
-- (2) todos os valores devem ser HSL válidos.
create or replace function public._paleta_tokens_validos(j jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  allowed_keys text[] := array[
    'primary', 'primary-foreground',
    'accent', 'accent-foreground',
    'ring',
    'secondary', 'secondary-foreground'
  ];
  k text; v text;
begin
  if j is null then return false; end if;
  -- nenhuma chave fora da whitelist
  for k in select jsonb_object_keys(j) loop
    if not (k = any(allowed_keys)) then return false; end if;
  end loop;
  -- todos os valores são HSL válidos
  for k, v in select key, value #>> '{}' from jsonb_each(j) loop
    if not public._paleta_hsl_valido(v) then return false; end if;
  end loop;
  return true;
end; $$;

-- ─── tabela principal ─────────────────────────────────────────────────────────
create table public.paleta (
  id           uuid primary key default gen_random_uuid(),
  escopo       public.escopo_paleta not null,
  empresa_id   uuid references public.empresa(id) on delete cascade,
  nome         text not null,
  semente_hsl  text,
  tokens_light jsonb not null,
  tokens_dark  jsonb not null,
  aprovada_aa  boolean not null default false,
  ativa        boolean not null default false,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  deleted_by   uuid references auth.users(id),

  -- coerência escopo ↔ empresa_id (RS-P14/CA2c)
  constraint paleta_escopo_coerente check (
    (escopo = 'oficial' and empresa_id is null) or
    (escopo = 'empresa' and empresa_id is not null)
  ),

  -- defesa em profundidade do gate AA: ativa exige aprovada_aa (RS-P6/CA6)
  constraint paleta_ativa_exige_aa check (ativa = false or aprovada_aa = true),

  -- formato HSL em tokens_light/tokens_dark (RS-P1/P2/P3/VETO-P1)
  constraint paleta_tokens_hsl_validos check (
    public._paleta_tokens_validos(tokens_light) and
    public._paleta_tokens_validos(tokens_dark)
  ),

  -- semente_hsl: se preenchida, deve ser HSL válida (RS-P3)
  constraint paleta_semente_hsl_valida check (
    semente_hsl is null or public._paleta_hsl_valido(semente_hsl)
  )
);

-- ─── índices (UNIQUE parcial one-active + busca por empresa) ─────────────────
-- Uma só oficial ativa (RS-P13/CA1/CA2b)
create unique index uq_paleta_oficial_ativa on public.paleta (escopo)
  where escopo = 'oficial' and ativa and deleted_at is null;

-- Uma só ativa por empresa (RS-P13/CA7/RN4)
create unique index uq_paleta_empresa_ativa on public.paleta (empresa_id)
  where escopo = 'empresa' and ativa and deleted_at is null;

-- Busca por empresa (performance de RLS / join do resolver)
create index ix_paleta_empresa on public.paleta (empresa_id) where deleted_at is null;

-- ─── RLS enable + force (RS-P8 — sentinela reprova se faltar) ────────────────
alter table public.paleta enable row level security;
alter table public.paleta force  row level security;

-- ─── policies ────────────────────────────────────────────────────────────────
-- Leitura pública (cor não é PII; vitrine/anônimo precisa aplicar — RN8/CA14)
-- Admin enxerga lixeira (deleted_at not null) para restore (CA15)
create policy paleta_select_publica on public.paleta
  for select to anon, authenticated
  using (deleted_at is null or (select public.is_admin()));

-- Escrita só admin (CA12): INSERT / UPDATE / DELETE
create policy paleta_admin_write on public.paleta
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ─── trigger de auditoria (RN11/CA17) ────────────────────────────────────────
create trigger zzz_audit
  after insert or update or delete on public.paleta
  for each row execute function audit.gravar_versao();

-- ─── seed: 2 oficiais (azul ENCAIXE ativa + vermelho inativa) — RN10/CA2/CA2c ──
-- Valores idênticos ao globals.css :root / [data-theme="dark"] / [data-palette="vermelho"]
-- para igualdade fallback (plan §3 — evita micro-flash).
-- Inserido sem created_by (seed do sistema; created_by NULL é permitido).

-- Azul ENCAIXE (oficial ativa — default site-wide)
insert into public.paleta (
  escopo, nome, aprovada_aa, ativa,
  tokens_light, tokens_dark
) values (
  'oficial', 'Azul ENCAIXE', true, true,
  '{"primary":"205 68% 33%","primary-foreground":"0 0% 100%","accent":"345 62% 30%","accent-foreground":"0 0% 100%","ring":"205 68% 33%","secondary":"40 18% 88%","secondary-foreground":"215 30% 18%"}'::jsonb,
  '{"primary":"205 75% 62%","primary-foreground":"216 40% 10%","accent":"345 60% 60%","accent-foreground":"216 40% 10%","ring":"205 75% 62%","secondary":"216 20% 20%","secondary-foreground":"40 24% 92%"}'::jsonb
);

-- Vermelho (oficial inativa — disponível como alternativa site-wide; CA2c)
insert into public.paleta (
  escopo, nome, aprovada_aa, ativa,
  tokens_light, tokens_dark
) values (
  'oficial', 'Vermelho ENCAIXE', true, false,
  '{"primary":"0 72% 45%","primary-foreground":"0 0% 100%","accent":"14 80% 42%","accent-foreground":"0 0% 100%","ring":"0 72% 45%"}'::jsonb,
  '{"primary":"0 80% 62%","primary-foreground":"216 40% 10%","accent":"14 85% 60%","accent-foreground":"216 40% 10%","ring":"0 80% 62%"}'::jsonb
);
