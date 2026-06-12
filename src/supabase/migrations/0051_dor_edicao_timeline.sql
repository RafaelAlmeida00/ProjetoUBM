-- Migração 0051 — edição de dor em qualquer status + timeline append-only (feature 004 delta-edição)
-- spec.md RN5/RN27/RN28/RN29 (emendas); security.md RS-ED1..RS-ED10; VETO-ED.
-- Opção A (lean, decisão do Maestro): editar dor publicada/em_moderacao → volta a em_moderacao
--   (reset aprovado_por/publicada_em). A vitrine (status_dor='publicada') já esconde a dor
--   durante a revisão. Sem colunas pub_* nem flag por-anexo.
-- Depende de: 0015 (dor/status_dor), 0017 (anexo_dor), 0018 (transicoes/_dor_guarda_transicao/
--             submeter_dor/moderar_dor/remover_anexo_admin), 0040/0042 (submeter_dor_landing),
--             0049 (criar_dor/editar_dor), 0004 (is_admin/esta_verificado), 0008 (audit).
-- Estratégia: usar triggers AFTER INSERT/UPDATE ON dor para emitir eventos de ciclo de vida.
--   Isso evita recriar RPCs que têm assinaturas diferentes em versões mais recentes
--   (ex: submeter_dor_landing em 0042 tem assinatura expandida — recriar com a assinatura
--   antiga criaria uma sobrecarga ambígua). editar_dor É recriada (mudança de lógica).
-- Gotcha crítico: create or replace function RESETA grants para PUBLIC — toda função recriada
--   precisa re-revoke from public,anon + grant mínimo NA MESMA migração.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. ENUM dor_evento_tipo (fechado — RS-ED6)
-- ══════════════════════════════════════════════════════════════════════════════
do $$ begin
  create type public.dor_evento_tipo as enum (
    'criada',
    'enviada_moderacao',
    'aprovada',
    'rejeitada',
    'publicada',
    'editada',
    'reenviada_moderacao',
    'anexo_adicionado',
    'anexo_removido',
    'removida_admin',
    'restaurada'
  );
exception when duplicate_object then null;
end $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. TABELA dor_evento — append-only, sem grant de escrita ao cliente (RS-ED6)
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists public.dor_evento (
  id          uuid        primary key default gen_random_uuid(),
  dor_id      uuid        not null references public.dor(id) on delete cascade,
  tipo        public.dor_evento_tipo not null,
  ator_id     uuid,       -- auth.uid() no momento; null para evento de sistema
  ator_papel  text,       -- 'admin' | 'representante' | 'sistema'
  ocorreu_em  timestamptz not null default now(),
  meta        jsonb       -- sem PII (RS-ED7): só referências e lista de campos
);

create index if not exists dor_evento_dor_id_ocorreu_em_idx
  on public.dor_evento (dor_id, ocorreu_em);

-- RLS enable+force — deny-by-default (RS-ED6)
alter table public.dor_evento enable row level security;
alter table public.dor_evento force  row level security;

-- SEM policy de SELECT pública (leitura só via RPC ler_timeline_dor — RS-ED7b)
-- SEM policy de INSERT/UPDATE/DELETE para anon ou authenticated (append-only pelo backend)

-- Revoke explícito de escrita (RS-ED6 — append-only; defense-in-depth além da RLS)
revoke insert, update, delete on public.dor_evento from public, anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. HELPER INTERNO _dor_log — insere evento SECURITY DEFINER (RS-ED6/RS-ED7)
-- ══════════════════════════════════════════════════════════════════════════════
-- Nunca exposto ao cliente; chamado só por triggers DEFINER desta migração.
-- meta: sem PII — para 'editada' guarda só lista de campos mudados; para
--   'anexo_adicionado/removido' guarda só anexo_id; NUNCA texto, motivo, nome_original.
create or replace function public._dor_log(
  p_dor_id  uuid,
  p_tipo    public.dor_evento_tipo,
  p_meta    jsonb default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_papel text;
begin
  -- Deriva papel do ator (RS-ED7a: admin/representante/sistema; identidade do admin não exposta)
  if v_uid is null then
    v_papel := 'sistema';
  elsif (select public.is_admin()) then
    v_papel := 'admin';
  else
    v_papel := 'representante';
  end if;

  insert into public.dor_evento (dor_id, tipo, ator_id, ator_papel, meta)
  values (p_dor_id, p_tipo, v_uid, v_papel, p_meta);
end;
$$;

-- _dor_log é helper interno — sem grant para nenhuma role de cliente
revoke execute on function public._dor_log(uuid, public.dor_evento_tipo, jsonb) from public, anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. ESTENDER _dor_guarda_transicao — adiciona publicada → em_moderacao (RS-ED8)
-- ══════════════════════════════════════════════════════════════════════════════
-- Recriada com a nova transição; mantém todas as existentes.
create or replace function public._dor_guarda_transicao()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_de   text := old.status_dor::text;
  v_para text := new.status_dor::text;
begin
  -- UPDATE de conteúdo sem troca de status: deixa passar
  if v_de = v_para then return new; end if;

  -- Matriz de transições permitidas (RN2 + emenda RS-ED8)
  case
    when v_de = 'rascunho' and v_para = 'em_moderacao' then
      null; -- OK: submeter_dor / submeter_dor_landing fazem as verificações de negócio

    when v_de = 'em_moderacao' and v_para = 'publicada' then
      -- Só via dor_publicavel (A1 satisfeita)
      if not public.dor_publicavel(new.id) then
        raise exception 'publicacao requer aprovacao do admin E verificacao do autor (A1)';
      end if;

    when v_de = 'em_moderacao' and v_para = 'rejeitada' then
      -- Rejeição exige motivo (RN11)
      if new.motivo_rejeicao is null or length(btrim(new.motivo_rejeicao)) = 0 then
        raise exception 'motivo_rejeicao obrigatorio ao rejeitar (RN11)';
      end if;

    when v_de = 'rejeitada' and v_para = 'em_moderacao' then
      null; -- OK: reenvio pelo autor

    when v_de = 'publicada' and v_para = 'em_moderacao' then
      null; -- NOVA (RS-ED8): re-edição pelo autor/admin faz dor voltar à moderação

    else
      raise exception 'transicao de estado invalida: % -> % (RN2/RS-ED8)', v_de, v_para;
  end case;

  return new;
end; $$;
-- _dor_guarda_transicao é trigger function — não requer grant de execute para roles de cliente

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. TRIGGER AFTER INSERT ON dor — emite 'criada' (+ 'enviada_moderacao' se landing)
-- ══════════════════════════════════════════════════════════════════════════════
-- Captura criar_dor (rascunho) e submeter_dor_landing (em_moderacao direta)
-- sem precisar recriar essas RPCs.
create or replace function public._dor_on_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  -- Emite 'criada' para toda dor inserida
  perform public._dor_log(new.id, 'criada'::public.dor_evento_tipo);

  -- submeter_dor_landing insere já em em_moderacao → emite também enviada_moderacao
  if new.status_dor = 'em_moderacao' then
    perform public._dor_log(new.id, 'enviada_moderacao'::public.dor_evento_tipo);
  end if;

  return new;
end;
$$;

drop trigger if exists dor_on_insert on public.dor;
create trigger dor_on_insert
  after insert on public.dor
  for each row execute function public._dor_on_insert();

-- Trigger functions são chamadas pelo sistema, não pelo cliente — revoke PUBLIC (RS-H1/RS-ED10)
revoke execute on function public._dor_on_insert() from public, anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. TRIGGER AFTER UPDATE OF status_dor ON dor — emite eventos de ciclo de vida
-- ══════════════════════════════════════════════════════════════════════════════
-- Captura transições de status sem precisar recriar submeter_dor, moderar_dor.
-- submeter_dor (rascunho → em_moderacao): enviada_moderacao
-- submeter_dor (rejeitada → em_moderacao): reenviada_moderacao
-- moderar_dor aprovar (em_moderacao → em_moderacao com aprovado_por): aprovada
-- moderar_dor aprovar com publicação (em_moderacao → publicada): publicada
-- moderar_dor rejeitar (em_moderacao → rejeitada): rejeitada
-- re-moderação por edição/anexo (publicada → em_moderacao): vem do editar_dor/trigger de anexo

create or replace function public._dor_on_status_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_de   text := old.status_dor::text;
  v_para text := new.status_dor::text;
begin
  -- Sem mudança de status: não faz nada
  if v_de = v_para then return new; end if;

  case
    when v_de = 'rascunho' and v_para = 'em_moderacao' then
      -- submeter_dor (primeiro envio)
      perform public._dor_log(new.id, 'enviada_moderacao'::public.dor_evento_tipo);

    when v_de = 'rejeitada' and v_para = 'em_moderacao' then
      -- submeter_dor (reenvio pós-rejeição)
      perform public._dor_log(new.id, 'reenviada_moderacao'::public.dor_evento_tipo);

    when v_de = 'em_moderacao' and v_para = 'publicada' then
      -- moderar_dor aprovar (+ publicação imediata via dor_publicavel)
      -- Nota: o evento 'aprovada' é emitido no UPDATE de aprovado_por (antes da publicação)
      -- Aqui emitimos só 'publicada' para a transição final
      perform public._dor_log(new.id, 'publicada'::public.dor_evento_tipo);

    when v_de = 'em_moderacao' and v_para = 'rejeitada' then
      -- moderar_dor rejeitar (meta sem motivo — RS-ED7)
      perform public._dor_log(new.id, 'rejeitada'::public.dor_evento_tipo);

    -- publicada → em_moderacao: tratado pelo editar_dor e trigger de anexo (reenviada_moderacao)
    -- Não emitimos aqui para evitar duplicação.
    else
      null; -- outras transições: sem evento adicional
  end case;

  return new;
end;
$$;

drop trigger if exists dor_on_status_change on public.dor;
create trigger dor_on_status_change
  after update of status_dor on public.dor
  for each row execute function public._dor_on_status_change();

revoke execute on function public._dor_on_status_change() from public, anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 7. TRIGGER AFTER UPDATE OF aprovado_por ON dor — emite 'aprovada'
-- ══════════════════════════════════════════════════════════════════════════════
-- moderar_dor faz dois UPDATEs: (1) set aprovado_por; (2) set status_dor='publicada'.
-- Este trigger captura o (1) e emite 'aprovada'.
create or replace function public._dor_on_aprovado()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  -- Só age quando aprovado_por passa de NULL para NOT NULL (aprovação pelo admin)
  if old.aprovado_por is null and new.aprovado_por is not null then
    perform public._dor_log(new.id, 'aprovada'::public.dor_evento_tipo);
  end if;
  return new;
end;
$$;

drop trigger if exists dor_on_aprovado on public.dor;
create trigger dor_on_aprovado
  after update of aprovado_por on public.dor
  for each row execute function public._dor_on_aprovado();

revoke execute on function public._dor_on_aprovado() from public, anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 8. RECRIAR editar_dor — expande para publicada/em_moderacao (RS-ED1/RS-ED5)
-- ══════════════════════════════════════════════════════════════════════════════
-- Assinatura IDÊNTICA à 0049 (mesmos parâmetros, sem novas sobrecargas).
-- Comportamento novo:
--   • status in ('rascunho','rejeitada') → edita in-place, emite 'editada'
--   • status = 'em_moderacao' → edita in-place, reseta aprovado_por/publicada_em,
--       emite 'editada'
--   • status = 'publicada' → seta em_moderacao + reset aprovado_por/publicada_em,
--       emite 'editada' + 'reenviada_moderacao'
-- Nota: o trigger _dor_on_status_change também seria acionado pelo UPDATE de status,
--   mas o caso publicada→em_moderacao não está no trigger (para evitar duplicação).
-- Gate: autor_id = auth.uid() + conta verificada (RS-ED1/RS-ED5).
create or replace function public.editar_dor(
  p_dor_id    uuid,
  p_descricao text,
  p_cursos    public.curso_ubm[] default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_dor        record;
  v_campos     text[] := '{}';
  v_re_moderar boolean := false;
begin
  -- Guarda 1: sessão obrigatória
  if v_uid is null then
    raise exception 'sessao necessaria para editar dor';
  end if;

  -- Carrega a dor (autoria + estado + aprovado_por)
  select id, autor_id, status_dor, descricao, aprovado_por, publicada_em
    into v_dor
    from public.dor
   where id = p_dor_id
     and deleted_at is null;

  if not found then
    raise exception 'dor nao encontrada';
  end if;

  -- Guarda 2: só o autor dono pode editar (RS-ED1)
  if v_dor.autor_id <> v_uid then
    raise exception 'permissao: apenas o autor dono pode editar sua dor (RS-ED1)';
  end if;

  -- Guarda 3: conta verificada obrigatória (RS-ED5/RN19)
  if not (select public.esta_verificado()) then
    raise exception 'permissao: conta nao verificada (RS-ED5/RN19)';
  end if;

  -- Guarda 4: estado editável (RN5 + emenda RS-ED1)
  if v_dor.status_dor not in ('rascunho', 'rejeitada', 'em_moderacao', 'publicada') then
    raise exception 'permissao: dor nao editavel no status atual';
  end if;

  -- Guarda 5: descrição não-vazia
  if p_descricao is null or length(btrim(p_descricao)) = 0 then
    raise exception 'descricao nao pode ser vazia';
  end if;

  -- Detecta campos mudados (para meta sem PII — RS-ED7)
  if p_descricao <> v_dor.descricao then
    v_campos := array_append(v_campos, 'descricao');
  end if;
  if p_cursos is not null then
    v_campos := array_append(v_campos, 'cursos');
  end if;

  -- Determina se precisa re-moderar (publicada ou em_moderacao → volta à fila)
  v_re_moderar := v_dor.status_dor in ('publicada', 'em_moderacao');

  if v_re_moderar then
    -- Atualiza conteúdo + seta em_moderacao + reset aprovação/publicação (Opção A lean)
    -- Não disparará _dor_on_status_change para publicada→em_moderacao (nenhum evento emitido lá)
    update public.dor
       set descricao    = p_descricao,
           status_dor   = 'em_moderacao',
           aprovado_por = null,
           aprovado_em  = null,
           publicada_em = null,
           updated_at   = now()
     where id = p_dor_id;
  else
    -- rascunho / rejeitada — in-place, sem troca de status
    update public.dor
       set descricao  = p_descricao,
           updated_at = now()
     where id = p_dor_id;
  end if;

  -- Substitui cursos (RN8 — se p_cursos fornecido)
  if p_cursos is not null then
    delete from public.dor_curso where dor_id = p_dor_id;
    insert into public.dor_curso (dor_id, curso)
    select p_dor_id, c
      from unnest(p_cursos) as c
    on conflict (dor_id, curso) do nothing;
  end if;

  -- Emite eventos na timeline (RS-ED6: via RPC DEFINER)
  -- meta sem PII: só lista de nomes de campos (RS-ED7)
  perform public._dor_log(
    p_dor_id,
    'editada'::public.dor_evento_tipo,
    jsonb_build_object('campos', to_jsonb(v_campos))
  );

  -- Se veio de publicada → emite também reenviada_moderacao
  if v_dor.status_dor = 'publicada' then
    perform public._dor_log(p_dor_id, 'reenviada_moderacao'::public.dor_evento_tipo);
  end if;
end;
$$;

-- Hardening: gotcha create or replace → reseta grants (RS-ED10/RS-H1)
revoke execute on function public.editar_dor(uuid, text, public.curso_ubm[]) from public, anon;
grant  execute on function public.editar_dor(uuid, text, public.curso_ubm[]) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 9. TRIGGER em anexo_dor — eventos de timeline + re-moderação (RS-ED4)
-- ══════════════════════════════════════════════════════════════════════════════
-- AFTER INSERT: emite 'anexo_adicionado'; se dor pai publicada → re-modera
-- AFTER UPDATE OF deleted_at: emite 'anexo_removido';
--   se removido por não-admin e dor pai publicada → re-modera
--   se removido por admin → NÃO re-modera (RS-A7)
create or replace function public._anexo_dor_timeline()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_dor_status public.status_dor;
begin
  -- Lê status atual da dor pai
  select status_dor into v_dor_status
    from public.dor
   where id = new.dor_id;

  if tg_op = 'INSERT' then
    -- Emite evento de adição (meta: só id do anexo — RS-ED7, sem nome_original)
    perform public._dor_log(
      new.dor_id,
      'anexo_adicionado'::public.dor_evento_tipo,
      jsonb_build_object('anexo_id', new.id)
    );

    -- Se dor pai estava publicada → re-moderação (Opção A lean — RS-ED4)
    if v_dor_status = 'publicada' then
      update public.dor
         set status_dor   = 'em_moderacao',
             aprovado_por = null,
             aprovado_em  = null,
             publicada_em = null,
             updated_at   = now()
       where id = new.dor_id;
      perform public._dor_log(new.dor_id, 'reenviada_moderacao'::public.dor_evento_tipo);
    end if;

  elsif tg_op = 'UPDATE' and new.deleted_at is not null and old.deleted_at is null then
    -- Remoção (soft-delete via deleted_at) — emite evento
    perform public._dor_log(
      new.dor_id,
      'anexo_removido'::public.dor_evento_tipo,
      jsonb_build_object('anexo_id', new.id)
    );

    -- Re-moderação só se NÃO for admin removendo de dor publicada (RS-A7: admin remove → não re-modera)
    if v_dor_status = 'publicada' and not (select public.is_admin()) then
      update public.dor
         set status_dor   = 'em_moderacao',
             aprovado_por = null,
             aprovado_em  = null,
             publicada_em = null,
             updated_at   = now()
       where id = new.dor_id;
      perform public._dor_log(new.dor_id, 'reenviada_moderacao'::public.dor_evento_tipo);
    end if;
  end if;

  return new;
end;
$$;

-- Cria trigger AFTER INSERT e AFTER UPDATE OF deleted_at em anexo_dor
drop trigger if exists anexo_dor_timeline on public.anexo_dor;
create trigger anexo_dor_timeline
  after insert or update of deleted_at on public.anexo_dor
  for each row execute function public._anexo_dor_timeline();

revoke execute on function public._anexo_dor_timeline() from public, anon, authenticated;

-- _dor_guarda_transicao foi recriada acima — revoke também (RS-H1)
revoke execute on function public._dor_guarda_transicao() from public, anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 10. ler_timeline_dor — RPC SECURITY DEFINER, sanitizada (RS-ED7b)
-- ══════════════════════════════════════════════════════════════════════════════
-- Visibilidade: dor publicada → qualquer um (anon incluído); não-publicada → só autor ou admin.
-- Retorno sanitizado: sem PII, sem meta cru.
-- rotulo: texto curto neutro derivado do tipo (sem dados pessoais).
create or replace function public.ler_timeline_dor(p_dor_id uuid)
returns table (
  tipo        public.dor_evento_tipo,
  ocorreu_em  timestamptz,
  ator_papel  text,
  rotulo      text
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_status     public.status_dor;
  v_autor_id   uuid;
  v_visivel    boolean := false;
begin
  -- Carrega visibilidade da dor (RS-ED7b)
  select d.status_dor, d.autor_id
    into v_status, v_autor_id
    from public.dor d
   where d.id = p_dor_id
     and d.deleted_at is null;

  if not found then
    -- Dor não existe ou foi deletada: retorna 0 linhas (não vaza existência)
    return;
  end if;

  -- Regra de visibilidade:
  --   publicada → qualquer um pode ver a timeline
  --   não-publicada → só o autor dono ou admin
  if v_status = 'publicada' then
    v_visivel := true;
  elsif v_uid is not null and (v_uid = v_autor_id or (select public.is_admin())) then
    v_visivel := true;
  end if;

  if not v_visivel then
    return; -- 0 linhas (RS-ED7b: anon/terceiro não vê timeline de dor não-publicada)
  end if;

  -- Retorna projeção sanitizada (sem meta cru, sem PII — RS-ED7)
  return query
    select
      e.tipo,
      e.ocorreu_em,
      e.ator_papel,
      case e.tipo
        when 'criada'              then 'Dor registrada'
        when 'enviada_moderacao'   then 'Enviada para moderação'
        when 'aprovada'            then 'Aprovada pelo admin'
        when 'rejeitada'           then 'Devolvida para revisão'
        when 'publicada'           then 'Publicada na vitrine'
        when 'editada'             then 'Conteúdo editado'
        when 'reenviada_moderacao' then 'Reenviada para moderação'
        when 'anexo_adicionado'    then 'Anexo adicionado'
        when 'anexo_removido'      then 'Anexo removido'
        when 'removida_admin'      then 'Removida pelo admin'
        when 'restaurada'          then 'Restaurada'
        else                            'Evento'
      end as rotulo
    from public.dor_evento e
   where e.dor_id = p_dor_id
   order by e.ocorreu_em asc;
end;
$$;

-- Grant mínimo: anon + authenticated podem ler a timeline (controlado pela lógica interna)
-- revoke public primeiro (RS-H1/RS-ED10)
revoke execute on function public.ler_timeline_dor(uuid) from public;
grant  execute on function public.ler_timeline_dor(uuid) to anon, authenticated;
