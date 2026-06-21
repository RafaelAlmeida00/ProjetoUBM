// @vitest-environment node
/**
 * T1.3 — 0066_assinatura (E18)
 *
 * RED: tabela não existe (migração 0066 ainda não aplicada).
 * GREEN: tabela existe com as constraints de idempotência e RLS espelhando o documento.
 *
 * Casos testados:
 *   (a) 2º INSERT autentique com mesmo provedor_doc_id falha (índice parcial — idempotência A)
 *   (b) 2 assinaturas para o mesmo documento falha (UNIQUE documento_id — 1:1)
 *   (c) RLS espelha o documento: rep VÊ, aluno NÃO VÊ
 *   (d) tabela tem RLS enable + force
 *
 * spec: RN7b/RN8/RN10/CA7/CA9/CA25 · RS8 · arch §4.2
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { novoBanco, comoUsuario, comoServiceRole, negado } from './_pglite/harness'
import type { PGlite } from '@electric-sql/pglite'

const HOST  = '00000000-0000-0000-0000-000000000001'
const REP   = '00000000-0000-0000-0000-000000000002'
const ALUNO = '00000000-0000-0000-0000-000000000003'
const ADM   = '00000000-0000-0000-0000-000000000004'
const CURSO = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

let db: PGlite
let empresaId: string
let projetoId: string
let docId: string

async function seed() {
  await db.exec(`
    insert into auth.users(id,email) values
      ('${HOST}','host@ubm.br'),
      ('${REP}','rep@ubm.br'),
      ('${ALUNO}','aluno@ubm.br'),
      ('${ADM}','adm@ubm.br');
    insert into public.admin_app(user_id) values ('${ADM}');
    insert into public.empresa(nome_canonico, created_by) values ('EmpTeste','${REP}');
    update public.perfil set verificado_em=now()
      where user_id in ('${HOST}','${REP}','${ALUNO}');
    insert into public.curso(id,slug,nome) values ('${CURSO}','direito','Direito');
    insert into public.coordenador_curso(user_id,curso_id,aprovado)
      values ('${HOST}','${CURSO}',true);
  `)

  empresaId = (
    await db.query<{ id: string }>(`select id from public.empresa limit 1`)
  ).rows[0]!.id

  await db.exec(
    `insert into public.membro_empresa(user_id,empresa_id,papel)
     values ('${REP}','${empresaId}','representante')`,
  )

  await comoServiceRole(db)
  const dorId = (
    await db.query<{ id: string }>(
      `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at)
       values ('${ALUNO}','${empresaId}','em_moderacao','Dor','Rep',true,'v1',now()) returning id`,
    )
  ).rows[0]!.id
  await db.query(`insert into public.dor_curso(dor_id,curso) values ('${dorId}','direito')`)

  await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
  await db.query(`select public.moderar_dor('${dorId}','aprovar',null)`)

  await comoServiceRole(db)
  projetoId = (
    await db.query<{ id: string }>(
      `select id from public.projeto where dor_id='${dorId}'`,
    )
  ).rows[0]!.id

  // indicações + fechar equipe + avançar
  await comoUsuario(db, { uid: HOST })
  await db.query(`select public.indicar_se('${projetoId}','coordenador',null)`)
  await comoUsuario(db, { uid: ALUNO })
  await db.query(`select public.indicar_se('${projetoId}','aluno','quero')`)

  await comoServiceRole(db)
  const indHost = (
    await db.query<{ id: string }>(
      `select id from public.indicacao where projeto_id='${projetoId}' and pessoa_id='${HOST}'`,
    )
  ).rows[0]!.id
  const indAluno = (
    await db.query<{ id: string }>(
      `select id from public.indicacao where projeto_id='${projetoId}' and pessoa_id='${ALUNO}'`,
    )
  ).rows[0]!.id

  await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
  await db.query(`select public.eleger_host('${projetoId}','${HOST}')`)
  await comoUsuario(db, { uid: HOST })
  await db.query(`select public.fechar_equipe('${projetoId}','${HOST}','[
    {"pessoa_id":"${HOST}","papel_projeto":"host","indicacao_id":"${indHost}"},
    {"pessoa_id":"${ALUNO}","papel_projeto":"aluno","indicacao_id":"${indAluno}"}
  ]')`)
  await db.query(`select public.avancar_projeto('${projetoId}')`)

  // insere documento de proposta via service_role
  await comoServiceRole(db)
  docId = (
    await db.query<{ id: string }>(
      `insert into public.documento_proposta
         (projeto_id, tipo, empresa_id, enviado_por, storage_path_original, created_by)
       values ('${projetoId}','proposta','${empresaId}','${HOST}','propostas/orig.pdf','${HOST}')
       returning id`,
    )
  ).rows[0]!.id
}

beforeEach(async () => {
  db = await novoBanco()
  await seed()
})
afterEach(async () => { await db.close() })

// Helpers
async function insertAssinatura(opts: {
  documentoId: string
  origem: string
  provedorDocId?: string | null
  status?: string
}) {
  const provedor = opts.provedorDocId == null ? 'null' : `'${opts.provedorDocId}'`
  const status = opts.status ?? 'pendente'
  return db.query<{ id: string }>(
    `insert into public.assinatura
       (documento_id, origem, signatario_id, status, provedor_doc_id)
     values
       ('${opts.documentoId}','${opts.origem}','${REP}','${status}',${provedor})
     returning id`,
  )
}

describe('0066 assinatura — constraints e RLS (RS8/RN10)', () => {
  it('tabela tem RLS habilitada e forçada', async () => {
    await comoServiceRole(db)
    const r = await db.query<{ rowsecurity: boolean; forcepolicy: boolean }>(
      `select relrowsecurity as rowsecurity, relforcerowsecurity as forcepolicy
       from pg_class
       where relname='assinatura' and relnamespace='public'::regnamespace`,
    )
    expect(r.rows[0]!.rowsecurity).toBe(true)
    expect(r.rows[0]!.forcepolicy).toBe(true)
  })

  it('(b) UNIQUE documento_id: 2 assinaturas para o mesmo documento falham (1:1)', async () => {
    await comoServiceRole(db)
    await insertAssinatura({ documentoId: docId, origem: 'upload_livre' })
    // 2ª tentativa deve violar UNIQUE(documento_id)
    expect(
      await negado(insertAssinatura({ documentoId: docId, origem: 'upload_livre' })),
    ).toBe(true)
  })

  it('(a) índice parcial uq_assinatura_autentique: 2º INSERT autentique com mesmo provedor_doc_id falha', async () => {
    await comoServiceRole(db)
    // primeiro documento tem assinatura autentique
    await insertAssinatura({
      documentoId: docId,
      origem: 'autentique',
      provedorDocId: 'prov-abc-001',
      status: 'enviada',
    })

    // cria um segundo documento para tentar reusar o mesmo provedor_doc_id
    const docId2 = (
      await db.query<{ id: string }>(
        `insert into public.documento_proposta
           (projeto_id, tipo, empresa_id, enviado_por, storage_path_original, created_by)
         values ('${projetoId}','proposta','${empresaId}','${HOST}','propostas/orig2.pdf','${HOST}')
         returning id`,
      )
    ).rows[0]!.id

    // mesmo provedor_doc_id com origem autentique => viola o índice parcial
    expect(
      await negado(
        insertAssinatura({
          documentoId: docId2,
          origem: 'autentique',
          provedorDocId: 'prov-abc-001',
          status: 'enviada',
        }),
      ),
    ).toBe(true)
  })

  it('(a) provedor_doc_id NULL não viola o índice parcial (dois autentique sem provedor)', async () => {
    await comoServiceRole(db)
    // pendente sem provedor_doc_id ainda
    await insertAssinatura({ documentoId: docId, origem: 'autentique', provedorDocId: null, status: 'pendente' })

    // segundo documento com provedor null também não viola (o índice só aplica when provedor IS NOT NULL)
    const docId2 = (
      await db.query<{ id: string }>(
        `insert into public.documento_proposta
           (projeto_id, tipo, empresa_id, enviado_por, storage_path_original, created_by)
         values ('${projetoId}','proposta','${empresaId}','${HOST}','propostas/orig3.pdf','${HOST}')
         returning id`,
      )
    ).rows[0]!.id
    // não deve lançar (provedor_doc_id é null, índice não se aplica)
    await expect(
      insertAssinatura({ documentoId: docId2, origem: 'autentique', provedorDocId: null, status: 'pendente' }),
    ).resolves.toBeTruthy()
  })

  it('(c) RLS espelha documento: representante VÊ a assinatura', async () => {
    await comoServiceRole(db)
    await insertAssinatura({ documentoId: docId, origem: 'autentique', provedorDocId: null })
    await comoUsuario(db, { uid: REP })
    const n = (
      await db.query<{ n: number }>(
        `select count(*)::int n from public.assinatura where documento_id='${docId}'`,
      )
    ).rows[0]!.n
    expect(n).toBe(1)
  })

  it('(c) RLS espelha documento: aluno NÃO VÊ a assinatura', async () => {
    await comoServiceRole(db)
    await insertAssinatura({ documentoId: docId, origem: 'autentique', provedorDocId: null })
    await comoUsuario(db, { uid: ALUNO })
    const n = (
      await db.query<{ n: number }>(
        `select count(*)::int n from public.assinatura where documento_id='${docId}'`,
      )
    ).rows[0]!.n
    expect(n).toBe(0)
  })

  it('(c) RLS espelha documento: host (coordinator) VÊ a assinatura', async () => {
    await comoServiceRole(db)
    await insertAssinatura({ documentoId: docId, origem: 'upload_livre' })
    await comoUsuario(db, { uid: HOST })
    const n = (
      await db.query<{ n: number }>(
        `select count(*)::int n from public.assinatura where documento_id='${docId}'`,
      )
    ).rows[0]!.n
    expect(n).toBe(1)
  })

  it('INSERT direto de authenticated é NEGADO (só via RPC)', async () => {
    await comoUsuario(db, { uid: REP })
    expect(
      await negado(
        insertAssinatura({ documentoId: docId, origem: 'autentique', provedorDocId: null }),
      ),
    ).toBe(true)
  })
})
