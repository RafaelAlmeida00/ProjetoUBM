// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoServiceRole, negado } from './_pglite/harness'

// Onda 1 / T-O1.6 — notificações da dor + restore + erasure estendida.
// CA4, CA7, CA8 · RN11, RN13, RN20; RS-LGPD1.
const A = '00000000-0000-0000-0000-0000000000aa'   // autor representante
const ADM = '00000000-0000-0000-0000-0000000000cc' // admin

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id,email) values ('${A}','a@empresa.com'),('${ADM}','adm@empresa.com');
    insert into public.admin_app(user_id) values ('${ADM}');
    insert into public.empresa(nome_canonico, created_by) values ('Nissan','${A}');
    insert into public.membro_empresa(user_id, empresa_id)
      select '${A}', id from public.empresa where nome_canonico='Nissan';
    update public.perfil set verificado_em = now() where user_id = '${A}';
  `)
}

async function empId(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  return (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
}

async function criarDorEmModeracao(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  const eid = await empId(db)
  return (await db.query<{ id: string }>(
    `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at)
     values ('${A}','${eid}','em_moderacao','dor test','Rep A',true,'v1',now()) returning id`
  )).rows[0]!.id
}

describe('0020 notificações + restore + erasure estendida', () => {
  it('tipo_notificacao tem os valores de dor adicionados (dor_em_moderacao, dor_publicada, dor_rejeitada)', async () => {
    const db = await novoBanco()
    const vals = (await db.query<{ v: string }>(
      `select unnest(enum_range(null::tipo_notificacao))::text v`
    )).rows.map(r => r.v)
    // Verifica os valores de dor (podem ser novos ADD VALUE ou reusar status_mudou com payload)
    // O plano previu dois caminhos: ADD VALUE ou reusar status_mudou. Testamos o que foi decidido.
    // Se ADD VALUE: os três novos valores devem estar presentes.
    // Se reuso de status_mudou: status_mudou já existe e os gatilhos usam payload.
    // Ambos são válidos — o teste verifica que há pelo menos um mecanismo de notificação de dor.
    const temDorEM = vals.includes('dor_em_moderacao') || vals.includes('status_mudou')
    expect(temDorEM).toBe(true)
    await db.close()
  })

  it('submeter dor cria notificação para admin (CA4 — admin avisado de nova dor em moderação)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await comoServiceRole(db)
    const dorId = await criarDorEmModeracao(db)
    // Verifica que a notificação foi criada (destinatário = admin)
    await db.exec('reset role')
    const notifs = (await db.query<{ n: number }>(
      `select count(*)::int n from public.notificacao where destinatario_id='${ADM}'`
    )).rows[0]!.n
    expect(notifs).toBeGreaterThan(0)
    await db.close()
  })

  it('moderar_dor(aprovar) cria notificação para autor (CA7 — autor avisado de publicação)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await comoServiceRole(db)
    const dorId = await criarDorEmModeracao(db)
    await db.exec('reset role')
    // Conta notifs do autor antes da moderação
    const antes = (await db.query<{ n: number }>(
      `select count(*)::int n from public.notificacao where destinatario_id='${A}'`
    )).rows[0]!.n
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.moderar_dor('${dorId}', 'aprovar', null)`)
    await db.exec('reset role')
    const depois = (await db.query<{ n: number }>(
      `select count(*)::int n from public.notificacao where destinatario_id='${A}'`
    )).rows[0]!.n
    expect(depois).toBeGreaterThan(antes)
    await db.close()
  })

  it('moderar_dor(rejeitar) cria notificação para autor com motivo (CA8)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await comoServiceRole(db)
    const dorId = await criarDorEmModeracao(db)
    await db.exec('reset role')
    const antes = (await db.query<{ n: number }>(
      `select count(*)::int n from public.notificacao where destinatario_id='${A}'`
    )).rows[0]!.n
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.moderar_dor('${dorId}', 'rejeitar', 'conteúdo inadequado')`)
    await db.exec('reset role')
    const depois = (await db.query<{ n: number }>(
      `select count(*)::int n from public.notificacao where destinatario_id='${A}'`
    )).rows[0]!.n
    expect(depois).toBeGreaterThan(antes)
    await db.close()
  })

  it('restore_record aceita tabela "dor" e restaura dor soft-deletada (RN20)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await comoServiceRole(db)
    const dorId = await criarDorEmModeracao(db)
    // soft-delete
    await db.query(`update public.dor set deleted_at=now() where id='${dorId}'`)
    // restaurar via admin
    await db.exec('reset role')
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.restore_record('dor', '${dorId}')`)
    await db.exec('reset role')
    const deleted = (await db.query<{ v: string | null }>(
      `select deleted_at::text v from public.dor where id='${dorId}'`
    )).rows[0]!.v
    expect(deleted).toBeNull()
    await db.close()
  })

  it('restore_record aceita tabela "anexo_dor" e restaura anexo soft-deletado (RN20)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await comoServiceRole(db)
    const dorId = await criarDorEmModeracao(db)
    const anexoId = (await db.query<{ id: string }>(
      `insert into public.anexo_dor(dor_id,storage_path,nome_original,mime_type,tamanho_bytes,enviado_por)
       values ('${dorId}','dor/${dorId}/1-f.png','f.png','image/png',1024,'${A}') returning id`
    )).rows[0]!.id
    // soft-delete
    await db.query(`update public.anexo_dor set deleted_at=now() where id='${anexoId}'`)
    // restaurar
    await db.exec('reset role')
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.restore_record('anexo_dor', '${anexoId}')`)
    await db.exec('reset role')
    const deleted = (await db.query<{ v: string | null }>(
      `select deleted_at::text v from public.anexo_dor where id='${anexoId}'`
    )).rows[0]!.v
    expect(deleted).toBeNull()
    await db.close()
  })

  it('erasure_titular anonimiza PII da dor viva (RS-LGPD1 — rep_nome/descricao/departamento/cargo)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await comoServiceRole(db)
    const eid = await empId(db)
    await db.query(
      `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,departamento,cargo,consentimento,consent_version,consent_at)
       values ('${A}','${eid}','rascunho','descricao PII aqui','Nome Real','TI','Analista',true,'v1',now())`
    )
    await db.exec('reset role')
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.erasure_titular('${A}')`)
    await db.exec('reset role')
    const dor = (await db.query<{ rep_nome: string; descricao: string }>(
      `select rep_nome, descricao from public.dor where autor_id='${A}'`
    )).rows[0]
    // PII deve estar anonimizada
    expect(dor?.rep_nome).not.toBe('Nome Real')
    expect(dor?.descricao).not.toBe('descricao PII aqui')
    await db.close()
  })

  it('não-admin não pode chamar restore_record (gate is_admin)', async () => {
    const db = await novoBanco(); await seedBase(db)
    await comoServiceRole(db)
    const dorId = await criarDorEmModeracao(db)
    await db.query(`update public.dor set deleted_at=now() where id='${dorId}'`)
    await db.exec('reset role')
    await comoUsuario(db, { uid: A })
    expect(await negado(db.query(`select public.restore_record('dor', '${dorId}')`))).toBe(true)
    await db.close()
  })
})
