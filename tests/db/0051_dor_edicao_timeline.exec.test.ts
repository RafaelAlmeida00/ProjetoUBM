// @vitest-environment node
// 0051 dor_edicao_timeline — TDD RED→GREEN
// Rastreab.: spec RN5/RN27/RN28/RN29; security.md RS-ED1..RS-ED10; VETO-ED.
// Opção A lean: editar dor publicada/em_moderacao → volta a em_moderacao (reset aprovado_por/publicada_em).
// Cobre:
//   - editar dor publicada → vira em_moderacao + aprovado_por null + eventos 'editada'/'reenviada_moderacao'
//   - vitrine (select status='publicada') não acha a dor em revisão
//   - editar dor em_moderacao → mantém em_moderacao + reset aprovado_por + eventos
//   - editar rascunho/rejeitada → in-place, sem re-moderação
//   - anexo INSERT em dor publicada → dor vira em_moderacao + evento
//   - anexo UPDATE deleted_at por autor em dor publicada → re-modera
//   - admin remove anexo → NÃO re-modera (RS-A7)
//   - editar por não-autor → negado (RS-ED1)
//   - editar sem verificação → negado (RS-ED5)
//   - dor_evento INSERT/UPDATE/DELETE direto por authenticated → NEGADO (RS-ED6/VETO-ED)
//   - ler_timeline_dor: publicada → visível a anon; não-publicada → 0 linhas p/ terceiro (RS-ED7b)
//   - meta sem PII (descrição/motivo/nome_original não aparecem) (RS-ED7)
//   - enum dor_evento_tipo fechado (verificado via pg_catalog)
//   - transição publicada → em_moderacao permitida (RS-ED8)
//   - transição publicada → publicada direta negada (VETO-ED)

import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoAnon, comoServiceRole, negado } from './_pglite/harness'

// ── UUIDs fixos ───────────────────────────────────────────────────────────────
const REP     = '00000000-0000-0000-0000-000000000001' // representante verificado
const REP2    = '00000000-0000-0000-0000-000000000002' // representante verificado (outro)
const ADM     = '00000000-0000-0000-0000-000000000003' // admin
const UNVERIF = '00000000-0000-0000-0000-000000000004' // representante NÃO verificado
const EMP_A   = 'aaaaaaaa-0000-0000-0000-000000000001'
const EMP_B   = 'bbbbbbbb-0000-0000-0000-000000000002'
const NOW     = new Date().toISOString()

// ── Seed base ─────────────────────────────────────────────────────────────────
async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${REP}',     'rep@empresa.com'),
      ('${REP2}',    'rep2@outra.com'),
      ('${ADM}',     'adm@ubm.com'),
      ('${UNVERIF}', 'unverif@empresa.com');

    insert into public.admin_app(user_id) values ('${ADM}');

    insert into public.empresa(id, nome_canonico, created_by) values
      ('${EMP_A}', 'Empresa A', '${ADM}'),
      ('${EMP_B}', 'Empresa B', '${ADM}');

    insert into public.papel_usuario(user_id, role) values
      ('${REP}',     'representante'),
      ('${REP2}',    'representante'),
      ('${UNVERIF}', 'representante');

    insert into public.membro_empresa(user_id, empresa_id, papel) values
      ('${REP}',     '${EMP_A}', 'representante'),
      ('${REP2}',    '${EMP_B}', 'representante'),
      ('${UNVERIF}', '${EMP_A}', 'representante');

    -- Verifica REP e REP2 (UNVERIF não verificado)
    update public.perfil set verificado_em = now()
     where user_id in ('${REP}', '${REP2}');
  `)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Cria dor em rascunho como REP em EMP_A e retorna o id. */
async function criarDorRep(
  db: import('@electric-sql/pglite').PGlite,
  descricao = 'Dor de teste'
): Promise<string> {
  await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
  const { rows } = await db.query<{ criar_dor: string }>(
    `select public.criar_dor($1, $2, $3, $4, $5) as criar_dor`,
    [EMP_A, descricao, true, 'v1', NOW]
  )
  return rows[0]!.criar_dor
}

/** Leva dor de rascunho → publicada (submit + admin aprova com A1 satisfeita). */
async function publicarDor(
  db: import('@electric-sql/pglite').PGlite,
  dorId: string
): Promise<void> {
  await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
  await db.query(`select public.submeter_dor($1)`, [dorId])

  await comoUsuario(db, { uid: ADM, email: 'adm@ubm.com', appMeta: { is_admin: true } })
  await db.query(`select public.moderar_dor($1, 'aprovar', null)`, [dorId])

  // Confirma que publicou (REP já estava verificado → A1 satisfeita)
  await comoServiceRole(db)
  const { rows } = await db.query<{ status_dor: string }>(
    `select status_dor from public.dor where id = $1`, [dorId]
  )
  if (rows[0]?.status_dor !== 'publicada') {
    throw new Error(`publicarDor: esperado 'publicada', obtido '${rows[0]?.status_dor}'`)
  }
}

/** Conta eventos de determinado tipo para uma dor. */
async function contarEventos(
  db: import('@electric-sql/pglite').PGlite,
  dorId: string,
  tipo: string
): Promise<number> {
  await comoServiceRole(db)
  const { rows } = await db.query<{ n: number }>(
    `select count(*)::int n from public.dor_evento
      where dor_id = $1 and tipo = $2::public.dor_evento_tipo`,
    [dorId, tipo]
  )
  return rows[0]!.n
}

// ══════════════════════════════════════════════════════════════════════════════
describe('0051 schema — enum e tabela dor_evento', () => {
  it('enum dor_evento_tipo existe no catalogo', async () => {
    const db = await novoBanco()
    const { rows } = await db.query<{ typname: string }>(
      `select typname from pg_type t
         join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = 'public' and t.typname = 'dor_evento_tipo'`
    )
    expect(rows.length, 'enum dor_evento_tipo deve existir').toBe(1)
    await db.close()
  })

  it('tabela dor_evento existe com colunas corretas', async () => {
    const db = await novoBanco()
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'dor_evento'
        order by ordinal_position`
    )
    const cols = rows.map(r => r.column_name)
    expect(cols).toContain('id')
    expect(cols).toContain('dor_id')
    expect(cols).toContain('tipo')
    expect(cols).toContain('ator_id')
    expect(cols).toContain('ator_papel')
    expect(cols).toContain('ocorreu_em')
    expect(cols).toContain('meta')
    await db.close()
  })

  it('RLS está habilitada e forçada em dor_evento', async () => {
    const db = await novoBanco()
    const { rows } = await db.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relrowsecurity, relforcerowsecurity from pg_class
        where relname = 'dor_evento' and relnamespace = 'public'::regnamespace`
    )
    expect(rows[0]!.relrowsecurity, 'RLS deve estar habilitada').toBe(true)
    expect(rows[0]!.relforcerowsecurity, 'RLS deve ser forçada').toBe(true)
    await db.close()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('0051 RS-ED6 — dor_evento append-only (VETO-ED condição 4)', () => {
  it('authenticated NÃO tem privilege INSERT em dor_evento (has_table_privilege)', async () => {
    const db = await novoBanco()
    const { rows } = await db.query<{ ok: boolean }>(
      `select has_table_privilege('authenticated', 'public.dor_evento', 'insert') ok`
    )
    expect(rows[0]!.ok, 'authenticated não deve ter INSERT em dor_evento').toBe(false)
    await db.close()
  })

  it('anon NÃO tem privilege INSERT em dor_evento', async () => {
    const db = await novoBanco()
    const { rows } = await db.query<{ ok: boolean }>(
      `select has_table_privilege('anon', 'public.dor_evento', 'insert') ok`
    )
    expect(rows[0]!.ok, 'anon não deve ter INSERT em dor_evento').toBe(false)
    await db.close()
  })

  it('authenticated NÃO tem privilege UPDATE em dor_evento', async () => {
    const db = await novoBanco()
    const { rows } = await db.query<{ ok: boolean }>(
      `select has_table_privilege('authenticated', 'public.dor_evento', 'update') ok`
    )
    expect(rows[0]!.ok, 'authenticated não deve ter UPDATE em dor_evento').toBe(false)
    await db.close()
  })

  it('authenticated NÃO tem privilege DELETE em dor_evento', async () => {
    const db = await novoBanco()
    const { rows } = await db.query<{ ok: boolean }>(
      `select has_table_privilege('authenticated', 'public.dor_evento', 'delete') ok`
    )
    expect(rows[0]!.ok, 'authenticated não deve ter DELETE em dor_evento').toBe(false)
    await db.close()
  })

  it('INSERT direto em dor_evento por authenticated → negado (RLS deny-by-default)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db)

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    const err = await negado(
      db.query(
        `insert into public.dor_evento (dor_id, tipo) values ($1, 'criada')`,
        [dorId]
      )
    )
    expect(err, 'INSERT direto em dor_evento deve ser negado').toBe(true)
    await db.close()
  })

  it('UPDATE direto em dor_evento por authenticated → negado', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db)

    // Obtém um evento via service_role
    await comoServiceRole(db)
    const { rows } = await db.query<{ id: string }>(
      `select id from public.dor_evento where dor_id = $1 limit 1`, [dorId]
    )
    if (rows.length === 0) {
      // sem evento, o update simplesmente não afeta linhas — mas o privilege já foi testado
      await db.close()
      return
    }
    const evId = rows[0]!.id

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    const err = await negado(
      db.query(`update public.dor_evento set ator_papel = 'hack' where id = $1`, [evId])
    )
    expect(err, 'UPDATE direto em dor_evento deve ser negado').toBe(true)
    await db.close()
  })

  it('DELETE direto em dor_evento por authenticated → negado', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db)

    await comoServiceRole(db)
    const { rows } = await db.query<{ id: string }>(
      `select id from public.dor_evento where dor_id = $1 limit 1`, [dorId]
    )
    if (rows.length === 0) {
      await db.close()
      return
    }
    const evId = rows[0]!.id

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    const err = await negado(
      db.query(`delete from public.dor_evento where id = $1`, [evId])
    )
    expect(err, 'DELETE direto em dor_evento deve ser negado').toBe(true)
    await db.close()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('0051 criar_dor — emite evento criada', () => {
  it('criar_dor emite evento criada na timeline', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db, 'Dor com evento criada')

    const n = await contarEventos(db, dorId, 'criada')
    expect(n, 'deve ter 1 evento criada').toBe(1)
    await db.close()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('0051 submeter_dor — emite eventos corretos', () => {
  it('submeter_dor (rascunho) emite enviada_moderacao', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db)

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.submeter_dor($1)`, [dorId])

    const n = await contarEventos(db, dorId, 'enviada_moderacao')
    expect(n, 'deve ter 1 evento enviada_moderacao').toBe(1)
    await db.close()
  })

  it('submeter_dor (rejeitada) emite reenviada_moderacao', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db)

    // rascunho → em_moderacao → rejeitada → em_moderacao (reenvio)
    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.submeter_dor($1)`, [dorId])

    await comoUsuario(db, { uid: ADM, email: 'adm@ubm.com', appMeta: { is_admin: true } })
    await db.query(`select public.moderar_dor($1, 'rejeitar', 'motivo teste')`, [dorId])

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.submeter_dor($1)`, [dorId])

    const n = await contarEventos(db, dorId, 'reenviada_moderacao')
    expect(n, 'deve ter 1 evento reenviada_moderacao').toBeGreaterThanOrEqual(1)
    await db.close()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('0051 moderar_dor — emite eventos corretos', () => {
  it('moderar_dor aprovar → emite aprovada + publicada (quando A1 satisfeita)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db)

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.submeter_dor($1)`, [dorId])

    await comoUsuario(db, { uid: ADM, email: 'adm@ubm.com', appMeta: { is_admin: true } })
    await db.query(`select public.moderar_dor($1, 'aprovar', null)`, [dorId])

    const nAprov = await contarEventos(db, dorId, 'aprovada')
    const nPub   = await contarEventos(db, dorId, 'publicada')
    expect(nAprov, 'deve ter 1 evento aprovada').toBe(1)
    expect(nPub,   'deve ter 1 evento publicada').toBe(1)
    await db.close()
  })

  it('moderar_dor rejeitar → emite rejeitada (sem motivo no meta)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db)

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.submeter_dor($1)`, [dorId])

    await comoUsuario(db, { uid: ADM, email: 'adm@ubm.com', appMeta: { is_admin: true } })
    await db.query(`select public.moderar_dor($1, 'rejeitar', 'motivo confidencial')`, [dorId])

    const n = await contarEventos(db, dorId, 'rejeitada')
    expect(n, 'deve ter 1 evento rejeitada').toBe(1)

    // RS-ED7: motivo NÃO deve aparecer no meta do evento
    await comoServiceRole(db)
    const { rows } = await db.query<{ meta: unknown }>(
      `select meta from public.dor_evento
        where dor_id = $1 and tipo = 'rejeitada'`, [dorId]
    )
    const metaStr = JSON.stringify(rows[0]?.meta ?? {})
    expect(metaStr, 'meta não deve conter o motivo de rejeição').not.toContain('motivo confidencial')
    await db.close()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('0051 editar_dor — estados rascunho/rejeitada (in-place)', () => {
  it('editar dor em rascunho → in-place, descricao atualizada, status permanece rascunho', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db, 'Descricao original')

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.editar_dor($1, $2)`, [dorId, 'Descricao editada'])

    await comoServiceRole(db)
    const { rows } = await db.query<{ descricao: string; status_dor: string }>(
      `select descricao, status_dor from public.dor where id = $1`, [dorId]
    )
    expect(rows[0]!.descricao, 'descricao atualizada').toBe('Descricao editada')
    expect(rows[0]!.status_dor, 'status permanece rascunho').toBe('rascunho')
    await db.close()
  })

  it('editar dor em rascunho emite evento editada (mas NÃO reenviada_moderacao)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db, 'Original')

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.editar_dor($1, $2)`, [dorId, 'Editada'])

    const nEditada   = await contarEventos(db, dorId, 'editada')
    const nReenviada = await contarEventos(db, dorId, 'reenviada_moderacao')
    expect(nEditada, 'deve ter evento editada').toBe(1)
    expect(nReenviada, 'rascunho: sem evento reenviada_moderacao').toBe(0)
    await db.close()
  })

  it('editar dor rejeitada → in-place, status permanece rejeitada', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db)

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.submeter_dor($1)`, [dorId])
    await comoUsuario(db, { uid: ADM, email: 'adm@ubm.com', appMeta: { is_admin: true } })
    await db.query(`select public.moderar_dor($1, 'rejeitar', 'motivo x')`, [dorId])

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.editar_dor($1, $2)`, [dorId, 'Corrigida'])

    await comoServiceRole(db)
    const { rows } = await db.query<{ status_dor: string }>(
      `select status_dor from public.dor where id = $1`, [dorId]
    )
    expect(rows[0]!.status_dor, 'status permanece rejeitada').toBe('rejeitada')
    await db.close()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('0051 editar_dor — dor publicada → re-moderação (VETO-ED condição 1)', () => {
  it('editar dor publicada → status vira em_moderacao (Opção A lean)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db, 'Dor para publicar')
    await publicarDor(db, dorId)

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.editar_dor($1, $2)`, [dorId, 'Conteudo editado'])

    await comoServiceRole(db)
    const { rows } = await db.query<{ status_dor: string; aprovado_por: string | null; publicada_em: string | null }>(
      `select status_dor, aprovado_por, publicada_em from public.dor where id = $1`, [dorId]
    )
    expect(rows[0]!.status_dor,   'status deve ser em_moderacao').toBe('em_moderacao')
    expect(rows[0]!.aprovado_por,  'aprovado_por deve ser null').toBeNull()
    expect(rows[0]!.publicada_em,  'publicada_em deve ser null').toBeNull()
    await db.close()
  })

  it('editar dor publicada → emite editada + reenviada_moderacao', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db)
    await publicarDor(db, dorId)

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.editar_dor($1, $2)`, [dorId, 'Nova descricao'])

    const nEditada   = await contarEventos(db, dorId, 'editada')
    const nReenviada = await contarEventos(db, dorId, 'reenviada_moderacao')
    expect(nEditada,   'deve ter evento editada').toBeGreaterThanOrEqual(1)
    expect(nReenviada, 'deve ter evento reenviada_moderacao').toBeGreaterThanOrEqual(1)
    await db.close()
  })

  it('VETO-ED 1: vitrine (status=publicada) NÃO retorna dor em revisão (anon não vê)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db)
    await publicarDor(db, dorId)

    // Autor edita → dor volta a em_moderacao
    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.editar_dor($1, $2)`, [dorId, 'Revisao pendente'])

    // Anon tenta ver a dor (vitrine filtra status='publicada')
    await comoAnon(db)
    const { rows } = await db.query<{ id: string }>(
      `select id from public.dor where id = $1 and status_dor = 'publicada'`, [dorId]
    )
    expect(rows.length, 'vitrine não deve mostrar dor em revisão ao anon').toBe(0)
    await db.close()
  })

  it('VETO-ED 1: UPDATE direto em dor publicada pelo autor não altera a row (RLS bloqueia silenciosamente)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db)
    await publicarDor(db, dorId)

    // A policy dor_update_conteudo permite apenas status rascunho/rejeitada.
    // Para dor publicada, a RLS filtra a row (0 linhas afetadas) — não lança exceção,
    // mas o conteúdo não muda. Isso garante que o autor não consegue alterar dor publicada diretamente.
    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(
      `update public.dor set descricao = 'hack direto' where id = $1`,
      [dorId]
    )

    // A dor deve permanecer com a descrição original (RLS não lança exceção mas bloqueia a escrita)
    await comoServiceRole(db)
    const { rows } = await db.query<{ descricao: string }>(
      `select descricao from public.dor where id = $1`, [dorId]
    )
    expect(rows[0]!.descricao, 'descricao não deve ter sido alterada pelo UPDATE direto').not.toBe('hack direto')
    await db.close()
  })

  it('meta do evento editada contem campos mudados (sem texto da descricao — RS-ED7)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db, 'Original super secreta')
    await publicarDor(db, dorId)

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.editar_dor($1, $2)`, [dorId, 'Novo conteudo secreto'])

    await comoServiceRole(db)
    const { rows } = await db.query<{ meta: unknown }>(
      `select meta from public.dor_evento
        where dor_id = $1 and tipo = 'editada'
        order by ocorreu_em desc limit 1`,
      [dorId]
    )
    const meta = rows[0]!.meta as Record<string, unknown>
    const metaStr = JSON.stringify(meta)

    // meta deve conter lista de campos
    expect(meta, 'meta deve existir').toBeTruthy()
    expect(metaStr, 'meta deve ter chave campos').toContain('campos')

    // RS-ED7: NUNCA texto da descrição ou da dor
    expect(metaStr, 'meta não deve conter texto da descricao').not.toContain('Original super secreta')
    expect(metaStr, 'meta não deve conter novo conteudo').not.toContain('Novo conteudo secreto')
    await db.close()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('0051 editar_dor — dor em_moderacao → re-enfileira', () => {
  it('editar dor em_moderacao → mantém em_moderacao + reset aprovado_por', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db)

    // Leva para em_moderacao com aprovação parcial (aprovado_por preenchido mas não verificado)
    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.submeter_dor($1)`, [dorId])

    // Admin aprova mas REP não verificou → aprovado_por preenchido, status em_moderacao
    // (Para este teste: forçamos aprovado_por via service_role para simular aprovação parcial)
    await comoServiceRole(db)
    await db.query(
      `update public.dor set aprovado_por = $1, aprovado_em = now() where id = $2`,
      [ADM, dorId]
    )

    // Autor edita → deve manter em_moderacao e resetar aprovado_por
    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.editar_dor($1, $2)`, [dorId, 'Editada em moderacao'])

    await comoServiceRole(db)
    const { rows } = await db.query<{ status_dor: string; aprovado_por: string | null }>(
      `select status_dor, aprovado_por from public.dor where id = $1`, [dorId]
    )
    expect(rows[0]!.status_dor,  'status permanece em_moderacao').toBe('em_moderacao')
    expect(rows[0]!.aprovado_por, 'aprovado_por resetado para null').toBeNull()
    await db.close()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('0051 editar_dor — guardas de segurança (RS-ED1, RS-ED5)', () => {
  it('RS-ED1: não-autor tentando editar → negado', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db, 'Dor do REP')

    await comoUsuario(db, { uid: REP2, email: 'rep2@outra.com' })
    const err = await negado(
      db.query(`select public.editar_dor($1, $2)`, [dorId, 'Hack'])
    )
    expect(err, 'não-autor deve ser negado').toBe(true)
    await db.close()
  })

  it('RS-ED5: conta não verificada → negado', async () => {
    const db = await novoBanco()
    await seedBase(db)

    // UNVERIF tem membro_empresa mas sem verificado_em
    await comoServiceRole(db)
    await db.query(`
      insert into public.dor (autor_id, empresa_id, status_dor, descricao, rep_nome,
                               consentimento, consent_version, consent_at, created_by)
      values ($1, $2, 'rascunho', 'Dor unverif', 'Unverif', true, 'v1', now(), $1)
    `, [UNVERIF, EMP_A])
    const { rows: dorRows } = await db.query<{ id: string }>(
      `select id from public.dor where autor_id = $1`, [UNVERIF]
    )
    const dorId = dorRows[0]!.id

    await comoUsuario(db, { uid: UNVERIF, email: 'unverif@empresa.com' })
    const err = await negado(
      db.query(`select public.editar_dor($1, $2)`, [dorId, 'Tentativa sem verificacao'])
    )
    expect(err, 'conta não verificada deve ser negada').toBe(true)
    await db.close()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('0051 trigger anexo_dor — INSERT em dor publicada → re-moderação (RS-ED4)', () => {
  it('adicionar anexo a dor publicada → dor vira em_moderacao + evento anexo_adicionado', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db)
    await publicarDor(db, dorId)

    // Insere anexo via service_role (simula upload real — a policy de INSERT exige verificado,
    // mas o trigger é AFTER INSERT e service_role bypassa RLS)
    await comoServiceRole(db)
    await db.query(`
      insert into public.anexo_dor
        (dor_id, storage_path, nome_original, mime_type, tamanho_bytes, enviado_por)
      values ($1, 'dor/${dorId}/uuid-doc.pdf', 'doc.pdf', 'application/pdf', 1024, $2)
    `, [dorId, REP])

    // Status da dor deve ter voltado para em_moderacao
    const { rows: dorRows } = await db.query<{ status_dor: string; aprovado_por: string | null }>(
      `select status_dor, aprovado_por from public.dor where id = $1`, [dorId]
    )
    expect(dorRows[0]!.status_dor,  'dor deve ser em_moderacao após anexo').toBe('em_moderacao')
    expect(dorRows[0]!.aprovado_por, 'aprovado_por deve ser null').toBeNull()

    // Evento anexo_adicionado deve existir
    const n = await contarEventos(db, dorId, 'anexo_adicionado')
    expect(n, 'deve ter evento anexo_adicionado').toBeGreaterThanOrEqual(1)

    // meta deve ter anexo_id mas NÃO nome_original (RS-ED7)
    const { rows: evRows } = await db.query<{ meta: unknown }>(
      `select meta from public.dor_evento
        where dor_id = $1 and tipo = 'anexo_adicionado'
        order by ocorreu_em desc limit 1`,
      [dorId]
    )
    const metaStr = JSON.stringify(evRows[0]?.meta ?? {})
    expect(metaStr, 'meta deve ter anexo_id').toContain('anexo_id')
    expect(metaStr, 'meta não deve ter nome_original').not.toContain('doc.pdf')
    await db.close()
  })

  it('VETO-ED 2: anexo de dor em revisão não é público (vitrine não vê)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db)
    await publicarDor(db, dorId)

    // Adiciona anexo (dispara re-moderação)
    await comoServiceRole(db)
    await db.query(`
      insert into public.anexo_dor
        (dor_id, storage_path, nome_original, mime_type, tamanho_bytes, enviado_por)
      values ($1, 'dor/${dorId}/uuid2.pdf', 'doc2.pdf', 'application/pdf', 512, $2)
    `, [dorId, REP])

    // Anon não deve ver este anexo (dor agora em_moderacao → policy anexo_select_publica nega)
    await comoAnon(db)
    const { rows } = await db.query<{ id: string }>(
      `select id from public.anexo_dor
        where dor_id = $1 and deleted_at is null`,
      [dorId]
    )
    expect(rows.length, 'anon não deve ver anexo de dor em revisão').toBe(0)
    await db.close()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('0051 trigger anexo_dor — remoção de anexo', () => {
  it('autor remove anexo de dor publicada → re-modera + evento anexo_removido', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db)
    await publicarDor(db, dorId)

    // Insere anexo (via service_role — trigger dispara re-moderação)
    await comoServiceRole(db)
    const { rows: anexoRows } = await db.query<{ id: string }>(`
      insert into public.anexo_dor
        (dor_id, storage_path, nome_original, mime_type, tamanho_bytes, enviado_por)
      values ($1, 'dor/${dorId}/rem.pdf', 'rem.pdf', 'application/pdf', 256, $2)
      returning id
    `, [dorId, REP])
    const anexoId = anexoRows[0]!.id

    // Re-publica a dor em dois UPDATEs separados (igual a moderar_dor) para respeitar
    // o trigger dor_guarda_transicao que usa dor_publicavel (que lê aprovado_por da tabela)
    await db.query(`
      update public.dor
         set aprovado_por = $1, aprovado_em = now(), updated_at = now()
       where id = $2
    `, [ADM, dorId])
    await db.query(`
      update public.dor
         set status_dor = 'publicada', publicada_em = now(), updated_at = now()
       where id = $1
    `, [dorId])

    // Confirma que está publicada
    const { rows: statusRows } = await db.query<{ status_dor: string }>(
      `select status_dor from public.dor where id = $1`, [dorId]
    )
    if (statusRows[0]?.status_dor !== 'publicada') {
      throw new Error(`setup: esperado publicada, obtido ${statusRows[0]?.status_dor}`)
    }

    // Simula remoção pelo autor via service_role com claims de REP (não-admin).
    // Em produção esta remoção ocorreria via RPC DEFINER do autor; aqui usamos
    // service_role mas com claims que fazem is_admin() = false, para que o trigger
    // _anexo_dor_timeline detecte que não é admin e re-modere a dor.
    // service_role bypassa RLS (o UPDATE de deleted_at é permitido), mas as
    // funções internas (_dor_log, is_admin) leem os JWT claims que configuramos.
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [
      JSON.stringify({ sub: REP, role: 'service_role', email: 'rep@empresa.com', app_metadata: {}, user_metadata: {} })
    ])
    await db.exec(`set role service_role;`)
    // O trigger _anexo_dor_timeline detecta is_admin() = false → re-modera
    await db.query(
      `update public.anexo_dor set deleted_at = now(), deleted_by = $1 where id = $2`,
      [REP, anexoId]
    )

    await comoServiceRole(db)
    const { rows } = await db.query<{ status_dor: string }>(
      `select status_dor from public.dor where id = $1`, [dorId]
    )
    expect(rows[0]!.status_dor, 'dor deve voltar a em_moderacao após remoção de anexo pelo autor').toBe('em_moderacao')

    const nRem = await contarEventos(db, dorId, 'anexo_removido')
    expect(nRem, 'deve ter evento anexo_removido').toBeGreaterThanOrEqual(1)
    await db.close()
  })

  it('RS-A7: admin remove anexo de dor publicada → NÃO re-modera', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db)
    await publicarDor(db, dorId)

    // Insere anexo (trigger dispara re-moderação: dor vai para em_moderacao)
    await comoServiceRole(db)
    const { rows: ar } = await db.query<{ id: string }>(`
      insert into public.anexo_dor
        (dor_id, storage_path, nome_original, mime_type, tamanho_bytes, enviado_por)
      values ($1, 'dor/${dorId}/admin-rem.pdf', 'admin-rem.pdf', 'application/pdf', 128, $2)
      returning id
    `, [dorId, REP])
    const anexoId = ar[0]!.id

    // Re-publica em dois UPDATEs separados (respeita a guarda de transição)
    await db.query(`
      update public.dor
         set aprovado_por = $1, aprovado_em = now(), updated_at = now()
       where id = $2
    `, [ADM, dorId])
    await db.query(`
      update public.dor
         set status_dor = 'publicada', publicada_em = now(), updated_at = now()
       where id = $1
    `, [dorId])

    // Confirma que está publicada
    const { rows: statusRows } = await db.query<{ status_dor: string }>(
      `select status_dor from public.dor where id = $1`, [dorId]
    )
    if (statusRows[0]?.status_dor !== 'publicada') {
      throw new Error(`setup: esperado publicada, obtido ${statusRows[0]?.status_dor}`)
    }

    // Admin remove via remover_anexo_admin (trigger _anexo_dor_timeline detecta is_admin() = true → não re-modera)
    await comoUsuario(db, { uid: ADM, email: 'adm@ubm.com', appMeta: { is_admin: true } })
    await db.query(`select public.remover_anexo_admin($1)`, [anexoId])

    await comoServiceRole(db)
    const { rows } = await db.query<{ status_dor: string }>(
      `select status_dor from public.dor where id = $1`, [dorId]
    )
    expect(rows[0]!.status_dor, 'admin remove anexo: dor deve permanecer publicada').toBe('publicada')
    await db.close()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('0051 ler_timeline_dor — visibilidade e sanitização (RS-ED7b)', () => {
  it('dor publicada: anon consegue ler timeline (retorna linhas)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db)
    await publicarDor(db, dorId)

    await comoAnon(db)
    const { rows } = await db.query(
      `select * from public.ler_timeline_dor($1)`, [dorId]
    )
    expect(rows.length, 'anon deve ver timeline de dor publicada').toBeGreaterThan(0)
    await db.close()
  })

  it('dor não-publicada: anon recebe 0 linhas (RS-ED7b)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db, 'Dor rascunho invisivel')

    await comoAnon(db)
    const { rows } = await db.query(
      `select * from public.ler_timeline_dor($1)`, [dorId]
    )
    expect(rows.length, 'anon não deve ver timeline de dor não-publicada').toBe(0)
    await db.close()
  })

  it('dor em_moderacao: terceiro (authenticated não-autor) recebe 0 linhas', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db)

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.submeter_dor($1)`, [dorId])

    // REP2 tenta ler a timeline
    await comoUsuario(db, { uid: REP2, email: 'rep2@outra.com' })
    const { rows } = await db.query(
      `select * from public.ler_timeline_dor($1)`, [dorId]
    )
    expect(rows.length, 'terceiro não deve ver timeline de dor não-publicada').toBe(0)
    await db.close()
  })

  it('dor rascunho: autor vê a própria timeline', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db)

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    const { rows } = await db.query(
      `select * from public.ler_timeline_dor($1)`, [dorId]
    )
    expect(rows.length, 'autor deve ver a própria timeline mesmo em rascunho').toBeGreaterThan(0)
    await db.close()
  })

  it('dor em_moderacao: admin vê a timeline', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db)

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.submeter_dor($1)`, [dorId])

    await comoUsuario(db, { uid: ADM, email: 'adm@ubm.com', appMeta: { is_admin: true } })
    const { rows } = await db.query(
      `select * from public.ler_timeline_dor($1)`, [dorId]
    )
    expect(rows.length, 'admin deve ver timeline de dor em_moderacao').toBeGreaterThan(0)
    await db.close()
  })

  it('retorno sanitizado: colunas tipo/ocorreu_em/ator_papel/rotulo — sem meta cru', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db)
    await publicarDor(db, dorId)

    await comoAnon(db)
    const { rows } = await db.query<{
      tipo: string; ocorreu_em: unknown; ator_papel: string; rotulo: string
    }>(`select tipo, ocorreu_em, ator_papel, rotulo from public.ler_timeline_dor($1)`, [dorId])

    expect(rows.length, 'deve ter pelo menos 1 evento').toBeGreaterThan(0)
    const ev = rows[0]!
    expect(ev.tipo,       'tipo deve existir').toBeTruthy()
    expect(ev.ocorreu_em, 'ocorreu_em deve existir').toBeTruthy()
    expect(ev.rotulo,     'rotulo deve existir').toBeTruthy()
    // Sem coluna meta no retorno (projeção sanitizada)
    expect((ev as Record<string, unknown>)['meta'], 'meta não deve estar no retorno').toBeUndefined()
    await db.close()
  })

  it('RS-ED10: anon tem execute em ler_timeline_dor (has_function_privilege)', async () => {
    const db = await novoBanco()
    const { rows } = await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.ler_timeline_dor(uuid)', 'execute') ok`
    )
    expect(rows[0]!.ok, 'anon deve ter execute em ler_timeline_dor').toBe(true)
    await db.close()
  })

  it('RS-ED10: public NÃO tem execute em _dor_log (helper interno)', async () => {
    const db = await novoBanco()
    // _dor_log é helper interno — nenhuma role de cliente deve ter execute
    const { rows } = await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon',
         'public._dor_log(uuid, public.dor_evento_tipo, jsonb)',
         'execute') ok`
    )
    expect(rows[0]!.ok, 'anon não deve ter execute em _dor_log').toBe(false)
    await db.close()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('0051 guarda de transição RS-ED8 — nova transição publicada → em_moderacao', () => {
  it('transição publicada → em_moderacao via service_role é permitida', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db)
    await publicarDor(db, dorId)

    // service_role bypassa RLS — deve poder trocar status sem a guarda bloquear
    await comoServiceRole(db)
    const err = await negado(
      db.query(
        `update public.dor set status_dor = 'em_moderacao', aprovado_por = null,
          aprovado_em = null, publicada_em = null, updated_at = now() where id = $1`,
        [dorId]
      )
    )
    expect(err, 'transição publicada→em_moderacao deve ser permitida pela guarda').toBe(false)
    await db.close()
  })

  it('transição em_moderacao → rascunho (inválida) continua negada', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db)

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.submeter_dor($1)`, [dorId])

    // Tenta fazer transição inválida via service_role (bypassa RLS mas não o trigger)
    await comoServiceRole(db)
    const err = await negado(
      db.query(
        `update public.dor set status_dor = 'rascunho' where id = $1`, [dorId]
      )
    )
    expect(err, 'transição em_moderacao→rascunho deve ser negada pelo trigger').toBe(true)
    await db.close()
  })
})
