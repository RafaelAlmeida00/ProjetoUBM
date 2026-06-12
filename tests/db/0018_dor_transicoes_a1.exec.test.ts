// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco, comoAnon, comoUsuario, comoServiceRole, negado } from './_pglite/harness'

// Onda 1 / T-O1.4 — núcleo A1 (ADR-004B): guarda de transição, RPCs, trigger de verificação.
// CA2, CA3, CA4, CA6, CA7, CA8, CA9, CA10, CA11, CA12, CA13, CA20, CA21(banco) ·
// RN2, RN3, RN4, RN7, RN9, RN10, RN11, RN12, RN13, RN16, RN19.
const A = '00000000-0000-0000-0000-0000000000aa'   // autor representante
const B = '00000000-0000-0000-0000-0000000000bb'   // terceiro
const ADM = '00000000-0000-0000-0000-0000000000cc' // admin

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id,email) values
      ('${A}','a@empresa.com'),('${B}','b@empresa.com'),('${ADM}','adm@empresa.com');
    insert into public.admin_app(user_id) values ('${ADM}');
    insert into public.empresa(nome_canonico, created_by) values ('Nissan','${A}');
    insert into public.membro_empresa(user_id, empresa_id)
      select '${A}', id from public.empresa where nome_canonico='Nissan';
  `)
}

async function empId(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  return (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
}

async function criarRascunho(db: import('@electric-sql/pglite').PGlite, incluirEmpresa = true, incluirConsent = true): Promise<string> {
  const eid = await empId(db)
  const empCol = incluirEmpresa ? `,'${eid}'` : ',null'
  const consentCol = incluirConsent ? `,true,'v1',now()` : `,false,null,null`
  return (await db.query<{ id: string }>(
    `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at)
     values ('${A}'${empCol},'rascunho','dor test','Rep A'${consentCol}) returning id`
  )).rows[0]!.id
}

async function verificarAutor(db: import('@electric-sql/pglite').PGlite, uid = A) {
  await db.exec(`reset role; update public.perfil set verificado_em=now() where user_id='${uid}'`)
}

async function statusDor(db: import('@electric-sql/pglite').PGlite, dorId: string): Promise<string> {
  return (await db.query<{ s: string }>(`select status_dor::text s from public.dor where id='${dorId}'`)).rows[0]!.s
}

async function aprovadoPor(db: import('@electric-sql/pglite').PGlite, dorId: string): Promise<string | null> {
  return (await db.query<{ v: string | null }>(`select aprovado_por::text v from public.dor where id='${dorId}'`)).rows[0]!.v
}

describe('0018 transições + invariante A1', () => {
  // ── Guarda de transição ────────────────────────────────────────────────────

  it('CA13: transição inválida rascunho→publicada é negada (guarda BEFORE UPDATE)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await verificarAutor(db)
    await comoServiceRole(db)
    const dorId = await criarRascunho(db)
    await db.exec('reset role')
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    expect(await negado(db.query(
      `update public.dor set status_dor='publicada', aprovado_por='${ADM}', aprovado_em=now(), publicada_em=now() where id='${dorId}'`
    ))).toBe(true)
    await db.close()
  })

  it('CA13: transição inválida rejeitada→publicada é negada', async () => {
    const db = await novoBanco(); await seedBase(db)
    await verificarAutor(db)
    await comoServiceRole(db)
    const dorId = await criarRascunho(db)
    await db.query(`update public.dor set status_dor='em_moderacao' where id='${dorId}'`)
    await db.query(`update public.dor set status_dor='rejeitada', motivo_rejeicao='spam' where id='${dorId}'`)
    await db.exec('reset role')
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    expect(await negado(db.query(
      `update public.dor set status_dor='publicada', aprovado_por='${ADM}', aprovado_em=now(), publicada_em=now() where id='${dorId}'`
    ))).toBe(true)
    await db.close()
  })

  it('CA13: transição inválida em_moderacao→rascunho é negada', async () => {
    const db = await novoBanco(); await seedBase(db)
    await verificarAutor(db)
    await comoServiceRole(db)
    const dorId = await criarRascunho(db)
    await db.query(`update public.dor set status_dor='em_moderacao' where id='${dorId}'`)
    await db.exec('reset role')
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    expect(await negado(db.query(`update public.dor set status_dor='rascunho' where id='${dorId}'`))).toBe(true)
    await db.close()
  })

  // ── submeter_dor ───────────────────────────────────────────────────────────

  it('CA4: submeter_dor muda rascunho→em_moderacao (autor verificado, com empresa e consentimento)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await verificarAutor(db)
    await comoServiceRole(db)
    const dorId = await criarRascunho(db)
    await db.exec('reset role')
    await comoUsuario(db, { uid: A })
    await db.query(`select public.submeter_dor('${dorId}')`)
    expect(await statusDor(db, dorId)).toBe('em_moderacao')
    await db.close()
  })

  it('CA2: submeter_dor sem empresa_id é negado (RN6)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await verificarAutor(db)
    await comoServiceRole(db)
    const dorId = await criarRascunho(db, false, true) // sem empresa
    await db.exec('reset role')
    await comoUsuario(db, { uid: A })
    expect(await negado(db.query(`select public.submeter_dor('${dorId}')`))).toBe(true)
    await db.close()
  })

  it('CA3: submeter_dor sem consentimento é negado (RN7)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await verificarAutor(db)
    await comoServiceRole(db)
    const dorId = await criarRascunho(db, true, false) // sem consentimento
    await db.exec('reset role')
    await comoUsuario(db, { uid: A })
    expect(await negado(db.query(`select public.submeter_dor('${dorId}')`))).toBe(true)
    await db.close()
  })

  it('CA20: submeter_dor sem verificação de conta é negado (RN19 — gate de verificação)', async () => {
    const db = await novoBanco(); await seedBase(db)
    // NÃO verifica o autor
    await comoServiceRole(db)
    const dorId = await criarRascunho(db)
    await db.exec('reset role')
    await comoUsuario(db, { uid: A })
    expect(await negado(db.query(`select public.submeter_dor('${dorId}')`))).toBe(true)
    await db.close()
  })

  it('CA9: dor rejeitada pode ser corrigida e reenviada (rejeitada→em_moderacao)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await verificarAutor(db)
    await comoServiceRole(db)
    const dorId = await criarRascunho(db)
    // admin rejeita
    await db.query(`update public.dor set status_dor='em_moderacao' where id='${dorId}'`)
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.moderar_dor('${dorId}', 'rejeitar', 'descricao muito vaga')`)
    expect(await statusDor(db, dorId)).toBe('rejeitada')
    // autor reenvia
    await comoUsuario(db, { uid: A })
    await db.query(`select public.submeter_dor('${dorId}')`)
    expect(await statusDor(db, dorId)).toBe('em_moderacao')
    await db.close()
  })

  // ── moderar_dor ────────────────────────────────────────────────────────────

  it('CA6: não-admin não pode aprovar/rejeitar dor (RN10)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await verificarAutor(db)
    await comoServiceRole(db)
    const dorId = await criarRascunho(db)
    await db.query(`update public.dor set status_dor='em_moderacao' where id='${dorId}'`)
    await db.exec('reset role')
    // terceiro B tenta aprovar
    await comoUsuario(db, { uid: B })
    expect(await negado(db.query(`select public.moderar_dor('${dorId}', 'aprovar', null)`))).toBe(true)
    // próprio autor tenta aprovar
    await comoUsuario(db, { uid: A })
    expect(await negado(db.query(`select public.moderar_dor('${dorId}', 'aprovar', null)`))).toBe(true)
    await db.close()
  })

  it('CA8: rejeitar sem motivo é negado (RN11)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await verificarAutor(db)
    await comoServiceRole(db)
    const dorId = await criarRascunho(db)
    await db.query(`update public.dor set status_dor='em_moderacao' where id='${dorId}'`)
    await db.exec('reset role')
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    expect(await negado(db.query(`select public.moderar_dor('${dorId}', 'rejeitar', null)`))).toBe(true)
    expect(await negado(db.query(`select public.moderar_dor('${dorId}', 'rejeitar', '')`))).toBe(true)
    await db.close()
  })

  it('CA8: rejeitar com motivo funciona e registra motivo (RN11)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await verificarAutor(db)
    await comoServiceRole(db)
    const dorId = await criarRascunho(db)
    await db.query(`update public.dor set status_dor='em_moderacao' where id='${dorId}'`)
    await db.exec('reset role')
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.moderar_dor('${dorId}', 'rejeitar', 'conteúdo inadequado')`)
    expect(await statusDor(db, dorId)).toBe('rejeitada')
    const mot = (await db.query<{ m: string }>(`select motivo_rejeicao m from public.dor where id='${dorId}'`)).rows[0]!.m
    expect(mot).toBe('conteúdo inadequado')
    await db.close()
  })

  // ── Invariante A1 — 4 cenários (CA7/CA10/CA11/CA12) ──────────────────────

  it('CA7: admin aprova dor cujo autor JÁ verificou → publica imediatamente (A1 satisfeita)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await verificarAutor(db) // autor já verificado ANTES da aprovação
    await comoServiceRole(db)
    const dorId = await criarRascunho(db)
    await db.query(`update public.dor set status_dor='em_moderacao' where id='${dorId}'`)
    await db.exec('reset role')
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.moderar_dor('${dorId}', 'aprovar', null)`)
    expect(await statusDor(db, dorId)).toBe('publicada')
    expect(await aprovadoPor(db, dorId)).toBe(ADM)
    // publicada_em deve estar preenchida
    const pub = (await db.query<{ v: string | null }>(`select publicada_em::text v from public.dor where id='${dorId}'`)).rows[0]!.v
    expect(pub).not.toBeNull()
    await db.close()
  })

  it('CA10: admin aprova dor cujo autor NÃO verificou → permanece em_moderacao (não publica)', async () => {
    const db = await novoBanco(); await seedBase(db)
    // NÃO verifica o autor
    await comoServiceRole(db)
    const dorId = await criarRascunho(db)
    await db.query(`update public.dor set status_dor='em_moderacao' where id='${dorId}'`)
    await db.exec('reset role')
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.moderar_dor('${dorId}', 'aprovar', null)`)
    // status deve continuar em_moderacao (aprovada-aguardando)
    expect(await statusDor(db, dorId)).toBe('em_moderacao')
    // mas aprovado_por deve estar preenchido
    expect(await aprovadoPor(db, dorId)).toBe(ADM)
    await db.close()
  })

  it('CA11: verificação do autor destrava publicação de dor já aprovada (A1 via trigger no perfil)', async () => {
    const db = await novoBanco(); await seedBase(db)
    // NÃO verifica ainda
    await comoServiceRole(db)
    const dorId = await criarRascunho(db)
    await db.query(`update public.dor set status_dor='em_moderacao' where id='${dorId}'`)
    await db.exec('reset role')
    // admin aprova — autor não verificado → fica em_moderacao
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.moderar_dor('${dorId}', 'aprovar', null)`)
    expect(await statusDor(db, dorId)).toBe('em_moderacao')
    // agora o autor verifica o e-mail → trigger no perfil deve publicar
    await verificarAutor(db) // atualiza perfil.verificado_em → dispara trigger
    expect(await statusDor(db, dorId)).toBe('publicada')
    await db.close()
  })

  it('CA12: verificação sem aprovação NÃO publica (A1 — ambas as condições necessárias)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await comoServiceRole(db)
    const dorId = await criarRascunho(db)
    await db.query(`update public.dor set status_dor='em_moderacao' where id='${dorId}'`)
    // verifica o autor SEM admin ter aprovado
    await verificarAutor(db)
    // dor deve continuar em_moderacao
    expect(await statusDor(db, dorId)).toBe('em_moderacao')
    expect(await aprovadoPor(db, dorId)).toBeNull()
    await db.close()
  })

  // ── submeter_dor_landing ───────────────────────────────────────────────────

  it('CA21/RN16: submeter_dor_landing cria dor em_moderacao para autor não-verificado (exceção estreita)', async () => {
    const db = await novoBanco(); await seedBase(db)
    // NÃO verifica o autor (é o caso da landing)
    // email corporativo obrigatório server-side (I4/RN23) — injeta claim email (= e-mail já no seed)
    const eid = await empId(db)
    await comoUsuario(db, { uid: A, email: 'a@empresa.com' })
    const dorId = (await db.query<{ out_dor_id: string }>(
      `select out_dor_id from public.submeter_dor_landing('${eid}','dor da landing','Rep A',null,null,true,'v1',now())`
    )).rows[0]!.out_dor_id
    expect(dorId).toBeTruthy()
    const s = await statusDor(db, dorId)
    expect(s).toBe('em_moderacao')
    await db.close()
  })

  it('E-D04/CA20: submeter_dor_landing NÃO habilita CRUD geral para não-verificado (exceção estreita)', async () => {
    const db = await novoBanco(); await seedBase(db)
    // autor não verificado usa landing para criar dor (permitido com e-mail corporativo — I4/RN23)
    const eid = await empId(db)
    await comoUsuario(db, { uid: A, email: 'a@empresa.com' })
    await db.query(
      `select * from public.submeter_dor_landing('${eid}','dor landing','Rep A',null,null,true,'v1',now())`
    )
    // mas NÃO pode criar outra dor via INSERT direto (gate de verificação bloqueia)
    expect(await negado(db.query(
      `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at)
       values ('${A}','${eid}','rascunho','dor direta','Rep A',true,'v1',now())`
    ))).toBe(true)
    await db.close()
  })

  it('submeter_dor_landing exige sessão (não pode ser chamado como anon)', async () => {
    const db = await novoBanco(); await seedBase(db)
    const eid = await empId(db)
    await comoAnon(db)
    expect(await negado(db.query(
      `select * from public.submeter_dor_landing('${eid}','dor anon','Rep A',null,null,true,'v1',now())`
    ))).toBe(true)
    await db.close()
  })

  // ── remover_anexo_admin ────────────────────────────────────────────────────

  it('remover_anexo_admin: admin remove anexo (soft-delete auditado); não-admin é negado (RN14/RS-A7)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await verificarAutor(db)
    await comoServiceRole(db)
    const dorId = (await db.query<{ id: string }>(
      `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at)
       select '${A}', id, 'em_moderacao','dor','Rep A',true,'v1',now() from public.empresa limit 1 returning id`
    )).rows[0]!.id
    const anexoId = (await db.query<{ id: string }>(
      `insert into public.anexo_dor(dor_id,storage_path,nome_original,mime_type,tamanho_bytes,enviado_por)
       values ('${dorId}','dor/${dorId}/1-f.png','f.png','image/png',1024,'${A}') returning id`
    )).rows[0]!.id
    // não-admin não pode remover
    await db.exec('reset role')
    await comoUsuario(db, { uid: B })
    expect(await negado(db.query(`select public.remover_anexo_admin('${anexoId}')`))).toBe(true)
    // admin remove
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.remover_anexo_admin('${anexoId}')`)
    await db.exec('reset role')
    const del = (await db.query<{ v: string | null }>(`select deleted_at::text v from public.anexo_dor where id='${anexoId}'`)).rows[0]!.v
    expect(del).not.toBeNull()
    await db.close()
  })
})
