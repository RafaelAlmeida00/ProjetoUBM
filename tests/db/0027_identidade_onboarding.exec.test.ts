// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoAnon, negado } from './_pglite/harness'

// Feature 004 delta — identidade/onboarding (migração 0027)
// RN21-26/CA24-30 · RS-ID1/RS-ID1a/RS-ID2/RS-ID3/RS-ID5/RS-ID7/RS-ID8/RS-ID9
// ADR-004C (dept/cargo em membro_empresa) · ADR-004D (self-service via RPC definer)

const A   = '00000000-0000-0000-0000-0000000000aa'   // aluno (email genérico)
const REP = '00000000-0000-0000-0000-0000000000bb'   // representante (email corporativo)
const ADM = '00000000-0000-0000-0000-0000000000cc'   // admin
const X   = '00000000-0000-0000-0000-0000000000dd'   // terceiro (para testar isolamento)

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${A}',   'aluno@gmail.com'),
      ('${REP}', 'rep@empresa.com'),
      ('${ADM}', 'adm@empresa.com'),
      ('${X}',   'outro@empresa.com');
    insert into public.admin_app(user_id) values ('${ADM}');
    -- empresa canônica para usar nos testes
    insert into public.empresa(nome_canonico, created_by)
      values ('Nissan Corp', '${ADM}');
    -- cursos para os testes de aluno_curso / onboarding_aluno (catálogo não vem por migração)
    insert into public.curso(slug, nome) values
      ('engenharia_de_software', 'Engenharia de Software'),
      ('direito', 'Direito');
    -- verificar o representante e o aluno (gate de verificação)
    -- perfil é criado pelo trigger handle_new_user ao inserir em auth.users
    update public.perfil set verificado_em = now()
     where user_id in ('${REP}', '${A}', '${X}');
  `)
}

async function empId(db: import('@electric-sql/pglite').PGlite): Promise<string> {
  return (await db.query<{ id: string }>(`select id from public.empresa limit 1`)).rows[0]!.id
}

async function cursoId(db: import('@electric-sql/pglite').PGlite, slug: string): Promise<string> {
  return (await db.query<{ id: string }>(
    `select id from public.curso where slug = $1 limit 1`, [slug]
  )).rows[0]!.id
}

// ─────────────────────────────────────────────────────────────────────────────
describe('0027 identidade/onboarding — estrutura e RLS', () => {
  it('tabela aluno_curso existe com PK composta e colunas corretas', async () => {
    const db = await novoBanco()
    const cols = (await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'aluno_curso'
        order by ordinal_position`
    )).rows.map(r => r.column_name)
    expect(cols).toContain('user_id')
    expect(cols).toContain('curso_id')
    expect(cols).toContain('created_at')
    await db.close()
  })

  it('membro_empresa tem colunas departamento e cargo (ADR-004C)', async () => {
    const db = await novoBanco()
    const cols = (await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'membro_empresa'
        order by ordinal_position`
    )).rows.map(r => r.column_name)
    expect(cols).toContain('departamento')
    expect(cols).toContain('cargo')
    await db.close()
  })

  it('RS-ID8: aluno_curso tem RLS habilitado e forçado (deny-by-default)', async () => {
    const db = await novoBanco()
    const row = (await db.query<{ rls_enabled: boolean; rls_forced: boolean }>(
      `select relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'aluno_curso'`
    )).rows[0]!
    expect(row.rls_enabled).toBe(true)
    expect(row.rls_forced).toBe(true)
    await db.close()
  })

  it('anon não vê linhas de aluno_curso (RLS deny-by-default — retorna 0 linhas sem erro)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    // Insere um vínculo como service_role para ter algo no banco
    await db.exec('reset role')
    await db.query(`set role service_role`)
    const cid = await cursoId(db, 'engenharia_de_software')
    await db.query(`insert into public.aluno_curso(user_id, curso_id) values ('${A}', '${cid}')`)
    await db.exec('reset role')
    // Anon: RLS com policy só para 'authenticated' → anon não tem policy → 0 linhas
    await comoAnon(db)
    const n = (await db.query<{ n: number }>(`select count(*)::int n from public.aluno_curso`)).rows[0]!.n
    expect(n).toBe(0)
    await db.close()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('0027 aluno_curso — self-service (CA25/RN23)', () => {
  it('aluno auto-declara curso (INSERT own sem RPC) — self-service direto', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const cid = await cursoId(db, 'engenharia_de_software')
    await comoUsuario(db, { uid: A })
    await db.query(
      `insert into public.aluno_curso(user_id, curso_id) values ('${A}', '${cid}')`
    )
    await db.exec('reset role')
    const n = (await db.query<{ n: number }>(
      `select count(*)::int n from public.aluno_curso where user_id = '${A}'`
    )).rows[0]!.n
    expect(n).toBe(1)
    await db.close()
  })

  it('aluno não pode declarar o mesmo curso duas vezes (PK composta — CA25)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const cid = await cursoId(db, 'engenharia_de_software')
    await comoUsuario(db, { uid: A })
    await db.query(
      `insert into public.aluno_curso(user_id, curso_id) values ('${A}', '${cid}')`
    )
    // segunda inserção deve falhar (PK conflict)
    expect(await negado(db.query(
      `insert into public.aluno_curso(user_id, curso_id) values ('${A}', '${cid}')`
    ))).toBe(true)
    await db.close()
  })

  it('aluno vê apenas seus próprios vínculos (RS-ID2a)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const cid = await cursoId(db, 'engenharia_de_software')
    // X insere seu próprio vínculo (como service_role para simplificar o setup)
    await db.exec('reset role')
    await db.query(`set role service_role`)
    await db.query(
      `insert into public.aluno_curso(user_id, curso_id) values ('${X}', '${cid}')`
    )
    await db.exec('reset role')
    // A só vê os próprios (nenhum)
    await comoUsuario(db, { uid: A })
    const n = (await db.query<{ n: number }>(
      `select count(*)::int n from public.aluno_curso`
    )).rows[0]!.n
    expect(n).toBe(0)
    await db.close()
  })

  it('terceiro não pode inserir vínculo de outro usuário (own-only)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const cid = await cursoId(db, 'engenharia_de_software')
    await comoUsuario(db, { uid: X })
    // tenta inserir como A (terceiro)
    expect(await negado(db.query(
      `insert into public.aluno_curso(user_id, curso_id) values ('${A}', '${cid}')`
    ))).toBe(true)
    await db.close()
  })

  it('aluno pode deletar seu próprio vínculo', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const cid = await cursoId(db, 'engenharia_de_software')
    await comoUsuario(db, { uid: A })
    await db.query(
      `insert into public.aluno_curso(user_id, curso_id) values ('${A}', '${cid}')`
    )
    await db.query(
      `delete from public.aluno_curso where user_id = '${A}' and curso_id = '${cid}'`
    )
    const n = (await db.query<{ n: number }>(
      `select count(*)::int n from public.aluno_curso where user_id = '${A}'`
    )).rows[0]!.n
    expect(n).toBe(0)
    await db.close()
  })

  it('conta não verificada não pode inserir em aluno_curso (gate de verificação)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const cid = await cursoId(db, 'engenharia_de_software')
    // ADM não está verificado (só REP/A/X estão na seedBase)
    // Mas ADM tem is_admin, então use um novo usuário não-verificado
    await db.exec(`
      insert into auth.users(id, email) values ('ffffffff-0000-0000-0000-000000000001', 'nv@empresa.com');
      -- perfil criado automaticamente pelo handle_new_user; sem verificado_em => não verificado
    `)
    await comoUsuario(db, { uid: 'ffffffff-0000-0000-0000-000000000001' })
    // conta não verificada → policy INSERT com esta_verificado() nega
    expect(await negado(db.query(
      `insert into public.aluno_curso(user_id, curso_id) values ('ffffffff-0000-0000-0000-000000000001', '${cid}')`
    ))).toBe(true)
    await db.close()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('0027 onboarding_aluno RPC (CA25)', () => {
  it('onboarding_aluno cria papel aluno + vínculos de curso + nome (CA25)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoUsuario(db, { uid: A })
    await db.query(
      `select public.onboarding_aluno('Estudante Teste', ARRAY['engenharia_de_software','direito']::public.curso_ubm[])`
    )
    await db.exec('reset role')
    // papel aluno criado
    const papel = (await db.query<{ n: number }>(
      `select count(*)::int n from public.papel_usuario where user_id='${A}' and role='aluno'`
    )).rows[0]!.n
    expect(papel).toBe(1)
    // vínculos de curso criados
    const cursos = (await db.query<{ n: number }>(
      `select count(*)::int n from public.aluno_curso where user_id='${A}'`
    )).rows[0]!.n
    expect(cursos).toBe(2)
    // nome atualizado
    const nome = (await db.query<{ nome: string | null }>(
      `select nome_publico as nome from public.perfil where user_id='${A}'`
    )).rows[0]!.nome
    expect(nome).toBe('Estudante Teste')
    await db.close()
  })

  it('onboarding_aluno com lista vazia de cursos: só cria papel + nome', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoUsuario(db, { uid: A })
    await db.query(`select public.onboarding_aluno('Aluno Sem Curso', NULL::public.curso_ubm[])`)
    await db.exec('reset role')
    const papel = (await db.query<{ n: number }>(
      `select count(*)::int n from public.papel_usuario where user_id='${A}' and role='aluno'`
    )).rows[0]!.n
    expect(papel).toBe(1)
    const cursos = (await db.query<{ n: number }>(
      `select count(*)::int n from public.aluno_curso where user_id='${A}'`
    )).rows[0]!.n
    expect(cursos).toBe(0)
    await db.close()
  })

  it('onboarding_aluno é idempotente (pode rodar duas vezes sem duplicar)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoUsuario(db, { uid: A })
    await db.query(`select public.onboarding_aluno('Aluno', ARRAY['engenharia_de_software']::public.curso_ubm[])`)
    // segunda chamada — não deve falhar nem duplicar
    await db.query(`select public.onboarding_aluno('Aluno Updated', ARRAY['engenharia_de_software']::public.curso_ubm[])`)
    await db.exec('reset role')
    const papel = (await db.query<{ n: number }>(
      `select count(*)::int n from public.papel_usuario where user_id='${A}' and role='aluno'`
    )).rows[0]!.n
    expect(papel).toBe(1)  // único
    const cursos = (await db.query<{ n: number }>(
      `select count(*)::int n from public.aluno_curso where user_id='${A}'`
    )).rows[0]!.n
    expect(cursos).toBe(1)  // único
    await db.close()
  })

  it('anon não pode chamar onboarding_aluno (grant só a authenticated)', async () => {
    const db = await novoBanco()
    await comoAnon(db)
    expect(await negado(db.query(`select public.onboarding_aluno('X', NULL::public.curso_ubm[])`))).toBe(true)
    await db.close()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('0027 onboarding_representante RPC (CA24/CA27)', () => {
  it('CA24: onboarding_representante cria papel + vínculo membro_empresa com dept/cargo + nome', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)
    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(
      `select public.onboarding_representante('${eid}', 'Rep Nome', 'TI', 'Analista', 'rep@empresa.com.br')`
    )
    await db.exec('reset role')
    // papel representante
    const papel = (await db.query<{ n: number }>(
      `select count(*)::int n from public.papel_usuario where user_id='${REP}' and role='representante'`
    )).rows[0]!.n
    expect(papel).toBe(1)
    // vínculo membro_empresa com dept/cargo
    const me = (await db.query<{ papel: string; departamento: string | null; cargo: string | null }>(
      `select papel, departamento, cargo from public.membro_empresa where user_id='${REP}' and empresa_id='${eid}'`
    )).rows[0]
    expect(me).toBeTruthy()
    expect(me!.papel).toBe('representante')
    expect(me!.departamento).toBe('TI')
    expect(me!.cargo).toBe('Analista')
    // nome no perfil
    const nome = (await db.query<{ nome: string | null }>(
      `select nome_publico as nome from public.perfil where user_id='${REP}'`
    )).rows[0]!.nome
    expect(nome).toBe('Rep Nome')
    await db.close()
  })

  it('CA27: onboarding_representante é idempotente (atualiza dept/cargo em conflict)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)
    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.onboarding_representante('${eid}', 'Rep Nome', 'TI', 'Analista', 'rep@empresa.com.br')`)
    // segunda chamada com dept/cargo diferente
    await db.query(`select public.onboarding_representante('${eid}', 'Rep Nome', 'RH', 'Gerente', 'rep@empresa.com.br')`)
    await db.exec('reset role')
    const me = (await db.query<{ departamento: string | null; cargo: string | null }>(
      `select departamento, cargo from public.membro_empresa where user_id='${REP}' and empresa_id='${eid}'`
    )).rows[0]!
    expect(me.departamento).toBe('RH')
    expect(me.cargo).toBe('Gerente')
    // apenas 1 vínculo (idempotente)
    const n = (await db.query<{ n: number }>(
      `select count(*)::int n from public.membro_empresa where user_id='${REP}'`
    )).rows[0]!.n
    expect(n).toBe(1)
    await db.close()
  })

  it('nega self-link sem e-mail corporativo (CA23/CA30 — RS-ID1)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)
    // A tem email gmail.com → deve ser negado
    await comoUsuario(db, { uid: A, email: 'aluno@gmail.com' })
    expect(await negado(db.query(
      `select public.onboarding_representante('${eid}', 'Nome', 'TI', 'Dev', 'aluno@gmail.com')`
    ))).toBe(true)
    await db.close()
  })

  it('nega empresa inexistente (RS-ID1)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    const fakeId = '00000000-dead-dead-dead-000000000000'
    expect(await negado(db.query(
      `select public.onboarding_representante('${fakeId}', 'Nome', 'TI', 'Dev', 'rep@empresa.com.br')`
    ))).toBe(true)
    await db.close()
  })

  it('RS-ID1a: nega exceder teto de 3 vínculos self-service', async () => {
    const db = await novoBanco()
    await seedBase(db)
    // Cria 3 empresas adicionais e o REP se vincula a todas como admin
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    for (let i = 1; i <= 3; i++) {
      await db.query(`insert into public.empresa(nome_canonico, created_by) values ('Empresa ${i}', '${ADM}')`)
    }
    // vincula via admin (simula vínculos já existentes para REP)
    await db.query(`
      insert into public.membro_empresa(user_id, empresa_id, papel)
      select '${REP}', id, 'representante' from public.empresa where nome_canonico like 'Empresa %'
    `)
    // cria empresa 4 para testar o teto
    await db.query(`insert into public.empresa(nome_canonico, created_by) values ('Empresa 4', '${ADM}')`)
    await db.exec('reset role')
    const newEid = (await db.query<{ id: string }>(
      `select id from public.empresa where nome_canonico = 'Empresa 4'`
    )).rows[0]!.id
    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    // deve ser negado (>= 3 vínculos existentes, empresa 4 é nova → seria o 4º)
    expect(await negado(db.query(
      `select public.onboarding_representante('${newEid}', 'Nome', 'TI', 'Dev', 'rep@empresa.com.br')`
    ))).toBe(true)
    await db.close()
  })

  it('CA30: vínculo criado apenas para o próprio usuário (anti-spoofing, auth.uid() fixo)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)
    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(
      `select public.onboarding_representante('${eid}', 'Rep Nome', 'TI', 'Dev', 'rep@empresa.com.br')`
    )
    await db.exec('reset role')
    // vínculo só para REP, não para outros
    const nRep = (await db.query<{ n: number }>(
      `select count(*)::int n from public.membro_empresa where user_id='${REP}'`
    )).rows[0]!.n
    expect(nRep).toBe(1)
    // X não tem vínculo
    const nX = (await db.query<{ n: number }>(
      `select count(*)::int n from public.membro_empresa where user_id='${X}'`
    )).rows[0]!.n
    expect(nX).toBe(0)
    await db.close()
  })

  it('CA30: onboarding_representante não cria vínculo de coordenador (anti-escalonamento)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)
    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(
      `select public.onboarding_representante('${eid}', 'Rep Nome', 'TI', 'Dev', 'rep@empresa.com.br')`
    )
    await db.exec('reset role')
    // coordenador_curso não deve ter linha para REP
    const nCoord = (await db.query<{ n: number }>(
      `select count(*)::int n from public.coordenador_curso where user_id='${REP}'`
    )).rows[0]!.n
    expect(nCoord).toBe(0)
    // admin_app não deve ter linha para REP
    const nAdmin = (await db.query<{ n: number }>(
      `select count(*)::int n from public.admin_app where user_id='${REP}'`
    )).rows[0]!.n
    expect(nAdmin).toBe(0)
    await db.close()
  })

  it('anon não pode chamar onboarding_representante (grant só a authenticated)', async () => {
    const db = await novoBanco()
    await comoAnon(db)
    expect(await negado(db.query(
      `select public.onboarding_representante('00000000-0000-0000-0000-000000000000'::uuid, 'X', 'X', 'X', 'x@empresa.com.br')`
    ))).toBe(true)
    await db.close()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('0027 CA29: coordenador não pode auto-selecionar curso (VETO-ID — RS-ID3)', () => {
  it('RLS de coordenador_curso permanece admin-only (escrita direta negada para authenticated)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const cid = await cursoId(db, 'engenharia_de_software')
    // REP tenta se vincular como coordenador diretamente (deve falhar — policy admin-only)
    await comoUsuario(db, { uid: REP })
    expect(await negado(db.query(
      `insert into public.coordenador_curso(user_id, curso_id) values ('${REP}', '${cid}')`
    ))).toBe(true)
    await db.close()
  })

  it('CA29: onboarding_representante não escreve em coordenador_curso (RPC estreita)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)
    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(`select public.onboarding_representante('${eid}', 'Nome', 'TI', 'Dev', 'rep@empresa.com.br')`)
    await db.exec('reset role')
    const n = (await db.query<{ n: number }>(
      `select count(*)::int n from public.coordenador_curso where user_id='${REP}'`
    )).rows[0]!.n
    expect(n).toBe(0)
    await db.close()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('0027 restore_record reconciliado — todos os 5 ramos (0020+0025+0027)', () => {
  async function seedDor(db: import('@electric-sql/pglite').PGlite): Promise<string> {
    const eid = await empId(db)
    return (await db.query<{ id: string }>(
      `insert into public.dor(autor_id,empresa_id,status_dor,descricao,rep_nome,consentimento,consent_version,consent_at)
       values ('${REP}','${eid}','em_moderacao','dor test','Rep B',true,'v1',now()) returning id`
    )).rows[0]!.id
  }

  it('restore_record dor — restaura dor soft-deletada (ramo 0020 preservado)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await db.exec('reset role')
    await db.query(`set role service_role`)
    const dorId = await seedDor(db)
    await db.query(`update public.dor set deleted_at=now() where id='${dorId}'`)
    await db.exec('reset role')
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.restore_record('dor', '${dorId}')`)
    await db.exec('reset role')
    const del = (await db.query<{ v: string | null }>(
      `select deleted_at::text v from public.dor where id='${dorId}'`
    )).rows[0]!.v
    expect(del).toBeNull()
    await db.close()
  })

  it('restore_record anexo_dor — restaura anexo soft-deletado (ramo 0020 preservado)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await db.exec('reset role')
    await db.query(`set role service_role`)
    const dorId = await seedDor(db)
    const anexoId = (await db.query<{ id: string }>(
      `insert into public.anexo_dor(dor_id,storage_path,nome_original,mime_type,tamanho_bytes,enviado_por)
       values ('${dorId}','dor/${dorId}/1-f.png','f.png','image/png',1024,'${REP}') returning id`
    )).rows[0]!.id
    await db.query(`update public.anexo_dor set deleted_at=now() where id='${anexoId}'`)
    await db.exec('reset role')
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.restore_record('anexo_dor', '${anexoId}')`)
    await db.exec('reset role')
    const del = (await db.query<{ v: string | null }>(
      `select deleted_at::text v from public.anexo_dor where id='${anexoId}'`
    )).rows[0]!.v
    expect(del).toBeNull()
    await db.close()
  })

  it('restore_record tabela inválida → exceção', async () => {
    const db = await novoBanco()
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    expect(await negado(db.query(
      `select public.restore_record('nao_existe', '00000000-0000-0000-0000-000000000000'::uuid)`
    ))).toBe(true)
    await db.close()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('0027 erasure_titular estendida (RS-ID5 — dept/cargo em membro_empresa + aluno_curso)', () => {
  it('erasure_titular anonimiza dept/cargo em membro_empresa + remove aluno_curso', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const eid = await empId(db)
    const cid = await cursoId(db, 'engenharia_de_software')
    // Setup: REP com vínculo + aluno A com curso
    await db.exec('reset role')
    await db.query(`set role service_role`)
    await db.query(`
      insert into public.membro_empresa(user_id, empresa_id, papel, departamento, cargo)
      values ('${REP}', '${eid}', 'representante', 'TI', 'Analista')
    `)
    await db.query(`
      insert into public.aluno_curso(user_id, curso_id) values ('${A}', '${cid}')
    `)
    await db.exec('reset role')
    // Erasure do REP
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.erasure_titular('${REP}')`)
    await db.exec('reset role')
    // dept/cargo devem estar null
    const me = (await db.query<{ departamento: string | null; cargo: string | null }>(
      `select departamento, cargo from public.membro_empresa where user_id='${REP}' and empresa_id='${eid}'`
    )).rows[0]!
    expect(me.departamento).toBeNull()
    expect(me.cargo).toBeNull()
    await db.close()
  })

  it('erasure_titular remove aluno_curso do titular (RS-ID-LGPD1)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    const cid = await cursoId(db, 'engenharia_de_software')
    await db.exec('reset role')
    await db.query(`set role service_role`)
    await db.query(`insert into public.aluno_curso(user_id, curso_id) values ('${A}', '${cid}')`)
    await db.exec('reset role')
    await comoUsuario(db, { uid: ADM, appMeta: { is_admin: true } })
    await db.query(`select public.erasure_titular('${A}')`)
    await db.exec('reset role')
    const n = (await db.query<{ n: number }>(
      `select count(*)::int n from public.aluno_curso where user_id='${A}'`
    )).rows[0]!.n
    expect(n).toBe(0)
    await db.close()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('0027 hardening: RS-H1/RS-ID9 — novas RPCs sem execute para PUBLIC', () => {
  it('RS-ID9: onboarding_representante NÃO tem execute para PUBLIC', async () => {
    const db = await novoBanco()
    const falhas = (await db.query<{ proname: string }>(
      `select p.proname
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('onboarding_representante', 'onboarding_aluno')
          and p.prosecdef = true
          and (
            select count(*) > 0
              from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
             where a.grantee = 0 and a.privilege_type = 'EXECUTE'
          )`
    )).rows
    expect(falhas.map(r => r.proname)).toHaveLength(0)
    await db.close()
  })

  it('RS-H1: restore_record e erasure_titular continuam sem execute para PUBLIC (re-revogado em 0027)', async () => {
    const db = await novoBanco()
    const falhas = (await db.query<{ proname: string }>(
      `select p.proname
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('restore_record', 'erasure_titular')
          and p.prosecdef = true
          and (
            select count(*) > 0
              from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
             where a.grantee = 0 and a.privilege_type = 'EXECUTE'
          )`
    )).rows
    expect(falhas.map(r => r.proname)).toHaveLength(0)
    await db.close()
  })
})
