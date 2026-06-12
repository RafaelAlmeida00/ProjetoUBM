// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco, comoAnon, comoUsuario, comoServiceRole, negado } from './_pglite/harness'

// Onda 1 / T-O1.3 — tabela anexo_dor (metadados); guarda quantidade, MIME allowlist, tamanho.
// CA14 (metadado), CA15 · RN14; RS-A1/RS-A2/RS-A3.
const A = '00000000-0000-0000-0000-0000000000aa'
const B = '00000000-0000-0000-0000-0000000000bb'
const ADM = '00000000-0000-0000-0000-0000000000cc'

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id,email) values ('${A}','a@empresa.com'),('${B}','b@empresa.com'),('${ADM}','adm@empresa.com');
    insert into public.admin_app(user_id) values ('${ADM}');
    insert into public.empresa(nome_canonico, created_by) values ('Nissan','${A}');
  `)
}

async function criarDor(db: import('@electric-sql/pglite').PGlite, status = 'rascunho'): Promise<string> {
  const empId = (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
  if (status === 'publicada') {
    return (await db.query<{ id: string }>(
      `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at,aprovado_por,aprovado_em,publicada_em)
       values ('${A}','${empId}','publicada','dor test','Rep A',true,'v1',now(),'${ADM}',now(),now()) returning id`
    )).rows[0]!.id
  }
  return (await db.query<{ id: string }>(
    `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at)
     values ('${A}','${empId}','${status}','dor test','Rep A',true,'v1',now()) returning id`
  )).rows[0]!.id
}

async function inserirAnexo(db: import('@electric-sql/pglite').PGlite, dorId: string, opts: {
  mime?: string; tamanho?: number; nome?: string; seq?: number
} = {}): Promise<string> {
  const mime = opts.mime ?? 'image/png'
  const tamanho = opts.tamanho ?? 1024
  const seq = opts.seq ?? 1
  const nome = opts.nome ?? `arquivo${seq}.png`
  return (await db.query<{ id: string }>(
    `insert into public.anexo_dor(dor_id, storage_path, nome_original, mime_type, tamanho_bytes, enviado_por)
     values ('${dorId}', 'dor/${dorId}/${seq}-${nome}', '${nome}', '${mime}', ${tamanho}, '${A}') returning id`
  )).rows[0]!.id
}

describe('0017 anexo_dor (metadados — arquivo no Storage)', () => {
  it('tabela anexo_dor existe com colunas esperadas (RS-A1)', async () => {
    const db = await novoBanco()
    const cols = (await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema='public' and table_name='anexo_dor' order by ordinal_position`
    )).rows.map(r => r.column_name)
    for (const c of ['id','dor_id','storage_path','nome_original','mime_type','tamanho_bytes','enviado_por','created_at','deleted_at']) {
      expect(cols, `coluna ${c} deve existir`).toContain(c)
    }
    // sem coluna de bytes do arquivo (RS-A1)
    expect(cols).not.toContain('arquivo_bytes')
    expect(cols).not.toContain('conteudo')
    await db.close()
  })

  it('insere metadado de anexo dentro dos limites (CA14)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await comoServiceRole(db)
    const dorId = await criarDor(db)
    const id = await inserirAnexo(db, dorId, { mime: 'image/png', tamanho: 1024 * 1024 })
    expect(id).toBeTruthy()
    await db.close()
  })

  it('MIME fora da allowlist é negado (CA15/RS-A3)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await comoServiceRole(db)
    const dorId = await criarDor(db)
    for (const mime of ['text/html', 'image/svg+xml', 'application/x-executable', 'application/zip', 'application/vnd.ms-excel']) {
      expect(
        await negado(inserirAnexo(db, dorId, { mime, nome: 'arq.bin', seq: 99 })),
        `MIME ${mime} deve ser negado`
      ).toBe(true)
    }
    await db.close()
  })

  it('MIME permitidos são aceitos (RS-A3)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await comoServiceRole(db)
    const dorId = await criarDor(db)
    const permitidos = [
      { mime: 'image/png', nome: 'img.png', seq: 1 },
      { mime: 'image/jpeg', nome: 'img.jpg', seq: 2 },
      { mime: 'image/webp', nome: 'img.webp', seq: 3 },
      { mime: 'application/pdf', nome: 'doc.pdf', seq: 4 },
      { mime: 'text/csv', nome: 'dados.csv', seq: 5 },
    ]
    for (const p of permitidos) {
      const id = await inserirAnexo(db, dorId, p)
      expect(id, `MIME ${p.mime} deve ser aceito`).toBeTruthy()
    }
    await db.close()
  })

  it('xlsx é aceito (RS-A3 — planilha sem macro)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await comoServiceRole(db)
    const dorId = await criarDor(db)
    const id = await inserirAnexo(db, dorId, {
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      nome: 'planilha.xlsx', seq: 1
    })
    expect(id).toBeTruthy()
    await db.close()
  })

  it('6º anexo em uma mesma dor é negado — limite 5 (CA15/RS-A2)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await comoServiceRole(db)
    const dorId = await criarDor(db)
    for (let i = 1; i <= 5; i++) {
      await inserirAnexo(db, dorId, { seq: i })
    }
    expect(await negado(inserirAnexo(db, dorId, { seq: 6 }))).toBe(true)
    await db.close()
  })

  it('tamanho acima de 5 MB é negado (CA15/RS-A2)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await comoServiceRole(db)
    const dorId = await criarDor(db)
    const cincoMbMaisUm = 5 * 1024 * 1024 + 1
    expect(await negado(inserirAnexo(db, dorId, { tamanho: cincoMbMaisUm }))).toBe(true)
    await db.close()
  })

  it('tamanho exatamente 5 MB é aceito (limite inclusivo)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await comoServiceRole(db)
    const dorId = await criarDor(db)
    const id = await inserirAnexo(db, dorId, { tamanho: 5 * 1024 * 1024 })
    expect(id).toBeTruthy()
    await db.close()
  })

  it('storage_path deve ser único (anti-duplicata de path)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await comoServiceRole(db)
    const dorId = await criarDor(db)
    await db.query(
      `insert into public.anexo_dor(dor_id, storage_path, nome_original, mime_type, tamanho_bytes, enviado_por)
       values ('${dorId}', 'dor/${dorId}/unico.png', 'unico.png', 'image/png', 100, '${A}')`
    )
    expect(await negado(db.query(
      `insert into public.anexo_dor(dor_id, storage_path, nome_original, mime_type, tamanho_bytes, enviado_por)
       values ('${dorId}', 'dor/${dorId}/unico.png', 'outro.png', 'image/png', 100, '${A}')`
    ))).toBe(true)
    await db.close()
  })

  it('RLS: anexo de dor não-publicada não vaza a terceiro (CA18/RS-A4)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await comoServiceRole(db)
    const dorId = await criarDor(db, 'em_moderacao')
    await inserirAnexo(db, dorId)
    // terceiro não vê
    await comoUsuario(db, { uid: B })
    const n = (await db.query<{ n: number }>(`select count(*)::int n from public.anexo_dor where dor_id='${dorId}'`)).rows[0]!.n
    expect(n).toBe(0)
    await db.close()
  })

  it('RLS: anon não vê anexo de dor não-publicada (RS-A4/RS-A5)', async () => {
    // NOTA (0051): inserir anexo em dor publicada re-modera a dor (RS-ED4/trigger _anexo_dor_timeline).
    // Para testar que anon VÊ anexo de dor publicada, é necessário que a dor tenha sido publicada
    // COM o anexo já incluído (inserido enquanto a dor estava em rascunho/em_moderacao, ANTES da publicação).
    // Este teste foca em: anon não vê anexo de dor não-publicada.
    const db = await novoBanco(); await seedBase(db)
    await comoServiceRole(db)
    const dorModId = await criarDor(db, 'em_moderacao')
    await inserirAnexo(db, dorModId, { seq: 1 })

    await comoAnon(db)
    const rows = (await db.query<{ dor_id: string }>(`select dor_id from public.anexo_dor`)).rows
    expect(rows.map(r => r.dor_id)).not.toContain(dorModId)
    await db.close()
  })

  it('RLS: anon vê anexo de dor que foi publicada com anexo existente (RS-A5)', async () => {
    // Cenário: anexo inserido em rascunho, dor publicada depois (contém o anexo no snapshot aprovado).
    // Após publicação, o anexo existente é público (dor.status='publicada').
    // NÃO inserimos novos anexos após a publicação (pois isso re-moderaria — RS-ED4/0051).
    // Fluxo: rascunho → inserir anexo → em_moderacao → set aprovado_por → publicada (A1).
    // Requer: autor A com verificado_em setado (A1 = aprovado_por + verificado_em).
    const db = await novoBanco(); await seedBase(db)
    await comoServiceRole(db)

    // Verifica o autor A (A1 exige verificado_em not null)
    await db.query(`update public.perfil set verificado_em = now() where user_id = '${A}'`)

    const empId = (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id

    // Insere dor em rascunho e o anexo (dor ainda não publicada — trigger não re-modera)
    const { rows: dorRows } = await db.query<{ id: string }>(
      `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at)
       values ('${A}','${empId}','rascunho','dor test','Rep A',true,'v1',now()) returning id`
    )
    const dorPubId = dorRows[0]!.id
    await inserirAnexo(db, dorPubId, { seq: 2 })

    // Publica a dor em 3 passos separados (respeita trigger de transição + dor_publicavel):
    // 1) rascunho → em_moderacao (não valida via trigger; só requer que a transição seja válida)
    await db.query(
      `update public.dor set status_dor = 'em_moderacao', updated_at = now() where id = $1`, [dorPubId]
    )
    // 2) set aprovado_por (A1a — admin aprovou)
    await db.query(
      `update public.dor set aprovado_por = '${ADM}', aprovado_em = now(), updated_at = now() where id = $1`, [dorPubId]
    )
    // 3) em_moderacao → publicada (dor_publicavel: aprovado_por not null + verificado_em not null → OK)
    await db.query(
      `update public.dor set status_dor = 'publicada', publicada_em = now(), updated_at = now() where id = $1`, [dorPubId]
    )

    await comoAnon(db)
    const rows = (await db.query<{ dor_id: string }>(`select dor_id from public.anexo_dor`)).rows
    expect(rows.map(r => r.dor_id)).toContain(dorPubId)
    await db.close()
  })

  it('RLS: autor vê os próprios anexos em qualquer estado (CA18/RN18)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await comoServiceRole(db)
    const dorId = await criarDor(db, 'rascunho')
    await inserirAnexo(db, dorId)
    await comoUsuario(db, { uid: A })
    const n = (await db.query<{ n: number }>(`select count(*)::int n from public.anexo_dor`)).rows[0]!.n
    expect(n).toBe(1)
    await db.close()
  })

  it('soft-delete: deleted_at oculta o anexo da listagem', async () => {
    const db = await novoBanco(); await seedBase(db)
    await comoServiceRole(db)
    const dorId = await criarDor(db, 'rascunho')
    const anexoId = await inserirAnexo(db, dorId)
    await comoUsuario(db, { uid: A })
    expect((await db.query<{ n: number }>(`select count(*)::int n from public.anexo_dor`)).rows[0]!.n).toBe(1)
    await db.exec(`reset role; update public.anexo_dor set deleted_at=now() where id='${anexoId}'`)
    await comoUsuario(db, { uid: A })
    expect((await db.query<{ n: number }>(`select count(*)::int n from public.anexo_dor`)).rows[0]!.n).toBe(0)
    await db.close()
  })

  it('sentinela: anexo_dor tem RLS enable+force (RS-D1)', async () => {
    const db = await novoBanco()
    const row = (await db.query<{ en: boolean; fo: boolean }>(
      `select relrowsecurity en, relforcerowsecurity fo from pg_class
       where relname='anexo_dor' and relnamespace=(select oid from pg_namespace where nspname='public')`
    )).rows[0]
    expect(row?.en).toBe(true)
    expect(row?.fo).toBe(true)
    await db.close()
  })

  it('trigger de auditoria grava inserção em anexo_dor (RN20)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await comoServiceRole(db)
    const dorId = await criarDor(db)
    await inserirAnexo(db, dorId)
    await db.exec('reset role')
    const n = (await db.query<{ n: number }>(
      `select count(*)::int n from audit.record_version where tabela='public.anexo_dor' and op='INSERT'`
    )).rows[0]!.n
    expect(n).toBeGreaterThan(0)
    await db.close()
  })
})
