// @vitest-environment node
// 0049 criar_dor / editar_dor — TDD RED→GREEN
// Rastreab.: spec RN4, RN5, RN7, RN8, RN19; security.md RS-D1/RS-D2; ADR-004F
// Funções:
//   criar_dor(p_empresa_id, p_descricao, p_consentimento, p_consent_version, p_consent_at, p_cursos default null)
//   editar_dor(p_dor_id, p_descricao, p_cursos default null)
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoAnon, comoServiceRole, negado } from './_pglite/harness'

const REP      = '00000000-0000-0000-0000-000000000001' // representante verificado, emp A
const REP2     = '00000000-0000-0000-0000-000000000002' // representante verificado, emp B
const USR      = '00000000-0000-0000-0000-000000000003' // sem papel representante
const ADM      = '00000000-0000-0000-0000-000000000004' // admin
const UNVERIF  = '00000000-0000-0000-0000-000000000005' // representante NÃO verificado
const EMP_A    = 'aaaaaaaa-0000-0000-0000-000000000001'
const EMP_B    = 'bbbbbbbb-0000-0000-0000-000000000002'
const NOW      = new Date().toISOString()

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${REP}',     'rep@empresa.com'),
      ('${REP2}',    'rep2@outra.com'),
      ('${USR}',     'usr@empresa.com'),
      ('${ADM}',     'adm@empresa.com'),
      ('${UNVERIF}', 'unverified@empresa.com');

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

    -- verificar REP e REP2 (UNVERIF e USR ficam sem verificação)
    update public.perfil set verificado_em = now()
     where user_id in ('${REP}', '${REP2}');
  `)
}

// helper: cria dor como REP em EMP_A e retorna o id
async function criarDorRep(db: import('@electric-sql/pglite').PGlite, descricao = 'Dor de teste'): Promise<string> {
  await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
  const { rows } = await db.query<{ criar_dor: string }>(
    `select public.criar_dor($1, $2, $3, $4, $5) as criar_dor`,
    [EMP_A, descricao, true, 'v1', NOW]
  )
  return rows[0]!.criar_dor
}

// ─────────────────────────────────────────────────────────────────────────────
describe('0049 criar_dor — função existe', () => {
  it('criar_dor existe no catalogo de funcoes', async () => {
    const db = await novoBanco()
    const rows = (await db.query<{ proname: string }>(
      `select proname from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'criar_dor'`
    )).rows
    expect(rows.length, 'criar_dor deve existir').toBeGreaterThan(0)
    await db.close()
  })

  it('editar_dor existe no catalogo de funcoes', async () => {
    const db = await novoBanco()
    const rows = (await db.query<{ proname: string }>(
      `select proname from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'editar_dor'`
    )).rows
    expect(rows.length, 'editar_dor deve existir').toBeGreaterThan(0)
    await db.close()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('0049 criar_dor — caminho feliz', () => {
  it('representante verificado cria rascunho: autor_id=uid, status=rascunho, empresa_id correto', async () => {
    const db = await novoBanco()
    await seedBase(db)

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    const { rows } = await db.query<{ criar_dor: string }>(
      `select public.criar_dor($1, $2, $3, $4, $5) as criar_dor`,
      [EMP_A, 'Dor de teste de criacao', true, 'v1', NOW]
    )
    expect(rows.length).toBe(1)
    const dorId = rows[0]!.criar_dor
    expect(dorId, 'deve retornar uuid').toBeTruthy()

    await comoServiceRole(db)
    const dor = (await db.query<{ autor_id: string; status_dor: string; empresa_id: string; consentimento: boolean }>(
      `select autor_id, status_dor, empresa_id, consentimento from public.dor where id = $1`, [dorId]
    )).rows[0]!
    expect(dor.autor_id, 'autor_id deve ser o uid do rep').toBe(REP)
    expect(dor.status_dor, 'status deve ser rascunho').toBe('rascunho')
    expect(dor.empresa_id, 'empresa_id deve ser EMP_A').toBe(EMP_A)
    expect(dor.consentimento, 'consentimento deve ser true').toBe(true)
    await db.close()
  })

  it('criar_dor com cursos — dedup: duplicata e ignorada', async () => {
    const db = await novoBanco()
    await seedBase(db)

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    const { rows } = await db.query<{ criar_dor: string }>(
      // p_cursos como 6o argumento (após consent_at)
      `select public.criar_dor($1, $2, $3, $4, $5,
         array['engenharia_de_software','direito','engenharia_de_software']::public.curso_ubm[]
       ) as criar_dor`,
      [EMP_A, 'Dor com cursos', true, 'v1', NOW]
    )
    const dorId = rows[0]!.criar_dor

    await comoServiceRole(db)
    const cursos = (await db.query<{ curso: string }>(
      `select curso from public.dor_curso where dor_id = $1 order by curso`, [dorId]
    )).rows.map(r => r.curso)
    expect(cursos).toContain('engenharia_de_software')
    expect(cursos).toContain('direito')
    expect(cursos.filter(c => c === 'engenharia_de_software').length, 'dedup: sem duplicata').toBe(1)
    await db.close()
  })

  it('criar_dor sem cursos (p_cursos null) — dor_curso vazio', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db, 'Dor sem cursos')

    await comoServiceRole(db)
    const n = (await db.query<{ n: number }>(
      `select count(*)::int n from public.dor_curso where dor_id = $1`, [dorId]
    )).rows[0]!.n
    expect(n, 'sem cursos: dor_curso deve estar vazio').toBe(0)
    await db.close()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('0049 criar_dor — guardas de segurança', () => {
  it('RN19: conta nao verificada → negado (mesmo sendo representante)', async () => {
    const db = await novoBanco()
    await seedBase(db)

    await comoUsuario(db, { uid: UNVERIF, email: 'unverified@empresa.com' })
    const err = await negado(
      db.query(`select public.criar_dor($1, $2, $3, $4, $5)`,
        [EMP_A, 'Dor nao verificado', true, 'v1', NOW])
    )
    expect(err, 'conta nao verificada deve ser negada').toBe(true)
    await db.close()
  })

  it('usuario sem papel representante → negado', async () => {
    const db = await novoBanco()
    await seedBase(db)

    await comoUsuario(db, { uid: USR, email: 'usr@empresa.com' })
    const err = await negado(
      db.query(`select public.criar_dor($1, $2, $3, $4, $5)`,
        [EMP_A, 'Dor sem papel', true, 'v1', NOW])
    )
    expect(err, 'sem papel representante deve ser negado').toBe(true)
    await db.close()
  })

  it('empresa que nao e do representante → negado', async () => {
    const db = await novoBanco()
    await seedBase(db)

    // REP é rep de EMP_A; tenta criar em EMP_B
    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    const err = await negado(
      db.query(`select public.criar_dor($1, $2, $3, $4, $5)`,
        [EMP_B, 'Dor empresa errada', true, 'v1', NOW])
    )
    expect(err, 'empresa que nao e do rep deve ser negada').toBe(true)
    await db.close()
  })

  it('RN7: sem consentimento → negado', async () => {
    const db = await novoBanco()
    await seedBase(db)

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    const err = await negado(
      db.query(`select public.criar_dor($1, $2, $3, $4, $5)`,
        [EMP_A, 'Dor sem consent', false, 'v1', NOW])
    )
    expect(err, 'sem consentimento deve ser negado').toBe(true)
    await db.close()
  })

  it('anon nao tem execute em criar_dor (has_function_privilege)', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon',
         'public.criar_dor(uuid, text, boolean, text, timestamptz, public.curso_ubm[])',
         'execute') ok`
    )).rows[0]!.ok
    expect(r, 'anon nao deve ter execute em criar_dor').toBe(false)
    await db.close()
  })

  it('anon chamando criar_dor → negado (permission denied)', async () => {
    const db = await novoBanco()
    await seedBase(db)

    await comoAnon(db)
    const err = await negado(
      db.query(`select public.criar_dor($1, $2, $3, $4, $5)`,
        [EMP_A, 'Dor anon', true, 'v1', NOW])
    )
    expect(err, 'anon nao pode chamar criar_dor').toBe(true)
    await db.close()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('0049 editar_dor — caminho feliz', () => {
  it('autor edita dor em rascunho (descricao atualizada)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db, 'Descricao original')

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.editar_dor($1, $2)`, [dorId, 'Descricao editada'])

    await comoServiceRole(db)
    const { descricao } = (await db.query<{ descricao: string }>(
      `select descricao from public.dor where id = $1`, [dorId]
    )).rows[0]!
    expect(descricao, 'descricao deve ser atualizada').toBe('Descricao editada')
    await db.close()
  })

  it('editar_dor com cursos → substitui conjunto (dedup)', async () => {
    const db = await novoBanco()
    await seedBase(db)

    // Cria com direito duplicado
    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    const { rows } = await db.query<{ criar_dor: string }>(
      `select public.criar_dor($1, $2, $3, $4, $5,
         array['direito','direito']::public.curso_ubm[]
       ) as criar_dor`,
      [EMP_A, 'Dor com cursos iniciais', true, 'v1', NOW]
    )
    const dorId = rows[0]!.criar_dor

    // Substitui pelo novo conjunto com duplicata
    await db.query(
      `select public.editar_dor($1, $2,
         array['engenharia_de_software','engenharia_de_software']::public.curso_ubm[]
       )`,
      [dorId, 'Dor editada']
    )

    await comoServiceRole(db)
    const cursos = (await db.query<{ curso: string }>(
      `select curso from public.dor_curso where dor_id = $1 order by curso`, [dorId]
    )).rows.map(r => r.curso)
    expect(cursos, 'apenas engenharia_de_software, sem direito, sem duplicata').toEqual(['engenharia_de_software'])
    await db.close()
  })

  it('autor edita dor rejeitada (RN5: rejeitada tambem e editavel)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db, 'Rascunho para rejeitar')

    // Caminho correto: rascunho → em_moderacao (submeter_dor) → rejeitada (moderar_dor como admin)
    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.submeter_dor($1)`, [dorId])

    await comoUsuario(db, { uid: ADM, email: 'adm@empresa.com', appMeta: { is_admin: true } })
    await db.query(`select public.moderar_dor($1, 'rejeitar', 'motivo teste')`, [dorId])

    // Agora o autor edita a dor rejeitada — deve funcionar
    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    const err = await negado(
      db.query(`select public.editar_dor($1, $2)`, [dorId, 'Corrigida apos rejeicao'])
    )
    expect(err, 'editar dor rejeitada deve ser permitido ao autor').toBe(false)
    await db.close()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('0049 editar_dor — guardas de segurança', () => {
  it('nao-autor nao pode editar dor (RN5)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db, 'Dor do REP')

    await comoUsuario(db, { uid: REP2, email: 'rep2@outra.com' })
    const err = await negado(
      db.query(`select public.editar_dor($1, $2)`, [dorId, 'Edicao nao autorizada'])
    )
    expect(err, 'nao-autor nao pode editar').toBe(true)
    await db.close()
  })

  it('dor publicada: autor pode editar (RN5 emendado por RN27/RS-ED1 — 0051 expande editar_dor)', async () => {
    // EMENDA RN5 (ruling RS-ED1, 0051): autor pode editar dor publicada; a edição
    // re-entra em moderação (publicada → em_moderacao). O teste original "não editável"
    // foi atualizado para refletir o novo comportamento aprovado.
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db, 'Rascunho para publicar')

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.submeter_dor($1)`, [dorId])

    await comoUsuario(db, { uid: ADM, email: 'adm@empresa.com', appMeta: { is_admin: true } })
    await db.query(`select public.moderar_dor($1, 'aprovar', null)`, [dorId])

    await comoServiceRole(db)
    const { status_dor } = (await db.query<{ status_dor: string }>(
      `select status_dor from public.dor where id = $1`, [dorId]
    )).rows[0]!
    expect(status_dor, 'dor deve estar publicada antes da edição').toBe('publicada')

    // Autor edita dor publicada — agora PERMITIDO (re-entra em moderação)
    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    const err = await negado(
      db.query(`select public.editar_dor($1, $2)`, [dorId, 'Conteudo editado'])
    )
    expect(err, 'dor publicada PODE ser editada pelo autor (RN27/RS-ED1)').toBe(false)

    // Confirma re-moderação
    await comoServiceRole(db)
    const { rows } = await db.query<{ status_dor: string }>(
      `select status_dor from public.dor where id = $1`, [dorId]
    )
    expect(rows[0]!.status_dor, 'editar dor publicada deve re-entrar em moderação').toBe('em_moderacao')
    await db.close()
  })

  it('dor em_moderacao: autor pode editar (RN5 emendado por RN27/RS-ED1 — 0051 expande editar_dor)', async () => {
    // EMENDA RN5 (ruling RS-ED1, 0051): autor pode editar dor em_moderacao (re-enfileira).
    // O teste original "não editável" foi atualizado para refletir o novo comportamento aprovado.
    const db = await novoBanco()
    await seedBase(db)
    const dorId = await criarDorRep(db, 'Rascunho para moderar')

    await comoServiceRole(db)
    await db.query(
      `update public.dor set status_dor = 'em_moderacao' where id = $1`, [dorId]
    )

    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    const err = await negado(
      db.query(`select public.editar_dor($1, $2)`, [dorId, 'Edicao em moderacao'])
    )
    expect(err, 'dor em_moderacao PODE ser editada pelo autor (RN27/RS-ED1)').toBe(false)
    await db.close()
  })

  it('anon nao tem execute em editar_dor (has_function_privilege)', async () => {
    const db = await novoBanco()
    const r = (await db.query<{ ok: boolean }>(
      `select has_function_privilege('anon',
         'public.editar_dor(uuid, text, public.curso_ubm[])',
         'execute') ok`
    )).rows[0]!.ok
    expect(r, 'anon nao deve ter execute em editar_dor').toBe(false)
    await db.close()
  })

  it('anon chamando editar_dor → negado (permission denied)', async () => {
    const db = await novoBanco()
    await seedBase(db)

    await comoAnon(db)
    const err = await negado(
      db.query(`select public.editar_dor($1, $2)`,
        ['00000000-0000-0000-0000-000000000099', 'Edicao anon'])
    )
    expect(err, 'anon nao pode editar_dor').toBe(true)
    await db.close()
  })
})
