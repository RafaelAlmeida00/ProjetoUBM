/**
 * Seed reutilizável para os testes da feature 008-analytics-views-rankings.
 *
 * Cria usuários, empresas, cursos, dores, projetos, membros, tarefas, opt-ins
 * e grupos de tamanhos variados (< 5 e >= 5) para os testes de k-anonimato.
 *
 * Uso: chamar seedAnalytics(db) depois de novoBanco() (o banco já tem migrações 0001..N aplicadas).
 */
import type { PGlite } from '@electric-sql/pglite'

// UUIDs determinísticos para facilitar asserções nos testes
export const IDS = {
  // Usuários
  userA:    '10000000-0000-0000-0000-000000000001', // aluno A (ranking_optin=true)
  userB:    '10000000-0000-0000-0000-000000000002', // aluno B (ranking_optin=false)
  userRep:  '10000000-0000-0000-0000-000000000010', // representante de empresa X
  userRepY: '10000000-0000-0000-0000-000000000011', // representante de empresa Y
  userCoord:'10000000-0000-0000-0000-000000000020', // coordenador dos cursos C1+C2
  userAdmin:'10000000-0000-0000-0000-000000000099', // admin

  // Membros extras para grupos k-anon alunos (grupo de >= 5 e grupo de < 5)
  m1: '20000000-0000-0000-0000-000000000001',
  m2: '20000000-0000-0000-0000-000000000002',
  m3: '20000000-0000-0000-0000-000000000003',
  m4: '20000000-0000-0000-0000-000000000004',
  m5: '20000000-0000-0000-0000-000000000005', // <- este faz o grupo atingir 5

  // Hosts extras para grupo k-anon de coordenadores (>= 5 host em engenharia_de_software)
  // Cada h* é host em um projeto finalizado de dorGrupoGrande (engenharia_de_software).
  h1: '20000000-0000-0000-0000-000000000011',
  h2: '20000000-0000-0000-0000-000000000012',
  h3: '20000000-0000-0000-0000-000000000013',
  h4: '20000000-0000-0000-0000-000000000014',
  h5: '20000000-0000-0000-0000-000000000015', // <- este fecha o grupo em 5 hosts

  // Dores individuais para projetos dos hosts h1-h5 (1 dor:1 projeto — uq_projeto_dor)
  dorH1: '50000000-0000-0000-0000-000000000021',
  dorH2: '50000000-0000-0000-0000-000000000022',
  dorH3: '50000000-0000-0000-0000-000000000023',
  dorH4: '50000000-0000-0000-0000-000000000024',
  dorH5: '50000000-0000-0000-0000-000000000025',

  // Projetos individuais para cada host h1-h5 (finalizados, engenharia_de_software)
  projetoH1: '60000000-0000-0000-0000-000000000021',
  projetoH2: '60000000-0000-0000-0000-000000000022',
  projetoH3: '60000000-0000-0000-0000-000000000023',
  projetoH4: '60000000-0000-0000-0000-000000000024',
  projetoH5: '60000000-0000-0000-0000-000000000025',

  // Empresas
  empresaX: '30000000-0000-0000-0000-000000000001',
  empresaY: '30000000-0000-0000-0000-000000000002',

  // Cursos (rows em public.curso para os cursos C1/C2/C3)
  cursoC1: '40000000-0000-0000-0000-000000000001', // engenharia_de_software
  cursoC2: '40000000-0000-0000-0000-000000000002', // administracao
  cursoC3: '40000000-0000-0000-0000-000000000003', // direito

  // Dores
  dorPublicadaX:    '50000000-0000-0000-0000-000000000001', // empresa X, publicada
  dorRascunhoX:     '50000000-0000-0000-0000-000000000002', // empresa X, rascunho
  dorPublicadaY:    '50000000-0000-0000-0000-000000000003', // empresa Y, publicada
  dorEmModeracao:   '50000000-0000-0000-0000-000000000004', // empresa X, em_moderacao

  // Projetos
  projetoFinalizado:    '60000000-0000-0000-0000-000000000001', // finalizado (de dorPublicadaX)
  projetoEmExecucao:    '60000000-0000-0000-0000-000000000002', // em_execucao (de dorPublicadaY)
  projetoSoftDeletado:  '60000000-0000-0000-0000-000000000003', // finalizado mas deleted_at set

  // Projetos para grupos k-anon (Onda B — T07/T08)
  projetoGrupoGrande:  '60000000-0000-0000-0000-000000000010', // >= 5 membros (alunos)
  projetoGrupoPequeno: '60000000-0000-0000-0000-000000000011', // < 5 membros (alunos)

  // Dores para esses projetos k-anon
  dorGrupoGrande:  '50000000-0000-0000-0000-000000000010',
  dorGrupoPequeno: '50000000-0000-0000-0000-000000000011',
}

export interface SeedResult {
  ids: typeof IDS
}

export async function seedAnalytics(db: PGlite): Promise<SeedResult> {
  // ── 1. Usuários em auth.users ─────────────────────────────────────────────
  await db.exec(`
    insert into auth.users (id, email) values
      ('${IDS.userA}',    'usera@ubm.test'),
      ('${IDS.userB}',    'userb@ubm.test'),
      ('${IDS.userRep}',  'rep_x@ubm.test'),
      ('${IDS.userRepY}', 'rep_y@ubm.test'),
      ('${IDS.userCoord}','coord@ubm.test'),
      ('${IDS.userAdmin}','admin@ubm.test'),
      ('${IDS.m1}', 'm1@ubm.test'),
      ('${IDS.m2}', 'm2@ubm.test'),
      ('${IDS.m3}', 'm3@ubm.test'),
      ('${IDS.m4}', 'm4@ubm.test'),
      ('${IDS.m5}', 'm5@ubm.test'),
      ('${IDS.h1}', 'h1@ubm.test'),
      ('${IDS.h2}', 'h2@ubm.test'),
      ('${IDS.h3}', 'h3@ubm.test'),
      ('${IDS.h4}', 'h4@ubm.test'),
      ('${IDS.h5}', 'h5@ubm.test')
    on conflict (id) do nothing;
  `)

  // ── 2. Admin ──────────────────────────────────────────────────────────────
  await db.exec(`
    insert into public.admin_app (user_id) values ('${IDS.userAdmin}')
    on conflict do nothing;
  `)

  // ── 3. Perfis (ranking_optin: A=true, B=false, extras=true) ──────────────
  // O trigger on_auth_user_created (0004) já criou a linha de perfil ao inserir auth.users;
  // aqui fazemos UPSERT para definir nome_publico e ranking_optin.
  await db.exec(`
    insert into public.perfil (user_id, nome_publico, ranking_optin) values
      ('${IDS.userA}',    'Alice UBM',    true),
      ('${IDS.userB}',    'Bob UBM',      false),
      ('${IDS.userRep}',  'Rep X',        false),
      ('${IDS.userRepY}', 'Rep Y',        false),
      ('${IDS.userCoord}','Coord UBM',    true),
      ('${IDS.userAdmin}','Admin UBM',    false),
      ('${IDS.m1}', 'Membro1', true),
      ('${IDS.m2}', 'Membro2', true),
      ('${IDS.m3}', 'Membro3', true),
      ('${IDS.m4}', 'Membro4', true),
      ('${IDS.m5}', 'Membro5', true),
      ('${IDS.h1}', 'Host1',   true),
      ('${IDS.h2}', 'Host2',   true),
      ('${IDS.h3}', 'Host3',   true),
      ('${IDS.h4}', 'Host4',   true),
      ('${IDS.h5}', 'Host5',   true)
    on conflict (user_id) do update
      set nome_publico  = excluded.nome_publico,
          ranking_optin = excluded.ranking_optin;
  `)

  // ── 4. Empresas ───────────────────────────────────────────────────────────
  await db.exec(`
    insert into public.empresa (id, nome_canonico, created_by) values
      ('${IDS.empresaX}', 'Empresa X Ltda', '${IDS.userAdmin}'),
      ('${IDS.empresaY}', 'Empresa Y SA',   '${IDS.userAdmin}')
    on conflict (id) do nothing;
  `)

  // ── 5. Membro_empresa (representantes) ───────────────────────────────────
  await db.exec(`
    insert into public.membro_empresa (user_id, empresa_id, papel) values
      ('${IDS.userRep}',  '${IDS.empresaX}', 'representante'),
      ('${IDS.userRepY}', '${IDS.empresaY}', 'representante')
    on conflict do nothing;
  `)

  // ── 6. Cursos em public.curso ─────────────────────────────────────────────
  await db.exec(`
    insert into public.curso (id, slug, nome) values
      ('${IDS.cursoC1}', 'engenharia_de_software', 'Engenharia de Software'),
      ('${IDS.cursoC2}', 'administracao',           'Administração'),
      ('${IDS.cursoC3}', 'direito',                 'Direito')
    on conflict do nothing;
  `)

  // ── 7. Coordenador_curso (aprovado=true para passar nos gates de 0053) ───
  await db.exec(`
    insert into public.coordenador_curso (user_id, curso_id, aprovado) values
      ('${IDS.userCoord}', '${IDS.cursoC1}', true),
      ('${IDS.userCoord}', '${IDS.cursoC2}', true)
    on conflict do nothing;
  `)

  // ── 8. Papel_usuario ──────────────────────────────────────────────────────
  await db.exec(`
    insert into public.papel_usuario (user_id, role) values
      ('${IDS.userA}',    'aluno'),
      ('${IDS.userB}',    'aluno'),
      ('${IDS.userRep}',  'representante'),
      ('${IDS.userRepY}', 'representante'),
      ('${IDS.userCoord}','coordenador'),
      ('${IDS.m1}', 'aluno'),
      ('${IDS.m2}', 'aluno'),
      ('${IDS.m3}', 'aluno'),
      ('${IDS.m4}', 'aluno'),
      ('${IDS.m5}', 'aluno'),
      ('${IDS.h1}', 'coordenador'),
      ('${IDS.h2}', 'coordenador'),
      ('${IDS.h3}', 'coordenador'),
      ('${IDS.h4}', 'coordenador'),
      ('${IDS.h5}', 'coordenador')
    on conflict do nothing;
  `)

  // ── 9. Dores ──────────────────────────────────────────────────────────────
  // Dor publicada de empresa X (autor = userRep, aprovador = admin)
  await db.exec(`
    insert into public.dor (id, autor_id, empresa_id, status_dor, descricao, rep_nome,
                             consentimento, aprovado_por, aprovado_em, publicada_em)
    values
      ('${IDS.dorPublicadaX}', '${IDS.userRep}', '${IDS.empresaX}', 'publicada',
       'Dor publicada empresa X', 'Rep X', true, '${IDS.userAdmin}', now(), now()),
      ('${IDS.dorRascunhoX}',  '${IDS.userRep}', '${IDS.empresaX}', 'rascunho',
       'Dor rascunho empresa X', 'Rep X', false, null, null, null),
      ('${IDS.dorPublicadaY}', '${IDS.userRepY}', '${IDS.empresaY}', 'publicada',
       'Dor publicada empresa Y', 'Rep Y', true, '${IDS.userAdmin}', now(), now()),
      ('${IDS.dorEmModeracao}','${IDS.userRep}', '${IDS.empresaX}', 'em_moderacao',
       'Dor em moderação X', 'Rep X', true, null, null, null)
    on conflict (id) do nothing;
  `)

  // Dores para grupos k-anon (publicadas de empresa X)
  await db.exec(`
    insert into public.dor (id, autor_id, empresa_id, status_dor, descricao, rep_nome,
                             consentimento, aprovado_por, aprovado_em, publicada_em)
    values
      ('${IDS.dorGrupoGrande}',  '${IDS.userRep}', '${IDS.empresaX}', 'publicada',
       'Dor grupo grande', 'Rep X', true, '${IDS.userAdmin}', now(), now()),
      ('${IDS.dorGrupoPequeno}', '${IDS.userRep}', '${IDS.empresaX}', 'publicada',
       'Dor grupo pequeno', 'Rep X', true, '${IDS.userAdmin}', now(), now())
    on conflict (id) do nothing;
  `)

  // ── 10. Dor_curso (vincular cursos às dores) ──────────────────────────────
  await db.exec(`
    insert into public.dor_curso (dor_id, curso) values
      ('${IDS.dorPublicadaX}',   'engenharia_de_software'),
      ('${IDS.dorPublicadaY}',   'administracao'),
      ('${IDS.dorGrupoGrande}',  'engenharia_de_software'),
      ('${IDS.dorGrupoPequeno}', 'direito')
    on conflict do nothing;
  `)

  // ── 11. Projetos ──────────────────────────────────────────────────────────
  // Projeto finalizado (de dorPublicadaX), em_execucao (de dorPublicadaY), soft-deletado
  await db.exec(`
    insert into public.projeto (id, dor_id, status, host_coordenador_id, aprovado_em)
    values
      ('${IDS.projetoFinalizado}', '${IDS.dorPublicadaX}', 'finalizado',
       '${IDS.userCoord}', now()),
      ('${IDS.projetoEmExecucao}', '${IDS.dorPublicadaY}', 'em_execucao',
       '${IDS.userCoord}', now()),
      ('${IDS.projetoSoftDeletado}', '${IDS.dorEmModeracao}', 'finalizado',
       '${IDS.userCoord}', now())
    on conflict (id) do nothing;
  `)

  // Soft-delete do terceiro projeto
  await db.exec(`
    update public.projeto set deleted_at = now() where id = '${IDS.projetoSoftDeletado}';
  `)

  // Projetos k-anon alunos (dor vinculada a cursos já inseridos acima)
  await db.exec(`
    insert into public.projeto (id, dor_id, status, host_coordenador_id, aprovado_em)
    values
      ('${IDS.projetoGrupoGrande}',  '${IDS.dorGrupoGrande}',  'finalizado',
       '${IDS.userCoord}', now()),
      ('${IDS.projetoGrupoPequeno}', '${IDS.dorGrupoPequeno}', 'finalizado',
       '${IDS.userCoord}', now())
    on conflict (id) do nothing;
  `)

  // Dores individuais para h1-h5 (publicadas de empresa X, engenharia_de_software)
  // Necessário porque uq_projeto_dor impede 2 projetos ativos na mesma dor.
  await db.exec(`
    insert into public.dor (id, autor_id, empresa_id, status_dor, descricao, rep_nome,
                             consentimento, aprovado_por, aprovado_em, publicada_em)
    values
      ('${IDS.dorH1}', '${IDS.userRep}', '${IDS.empresaX}', 'publicada',
       'Dor host1', 'Rep X', true, '${IDS.userAdmin}', now(), now()),
      ('${IDS.dorH2}', '${IDS.userRep}', '${IDS.empresaX}', 'publicada',
       'Dor host2', 'Rep X', true, '${IDS.userAdmin}', now(), now()),
      ('${IDS.dorH3}', '${IDS.userRep}', '${IDS.empresaX}', 'publicada',
       'Dor host3', 'Rep X', true, '${IDS.userAdmin}', now(), now()),
      ('${IDS.dorH4}', '${IDS.userRep}', '${IDS.empresaX}', 'publicada',
       'Dor host4', 'Rep X', true, '${IDS.userAdmin}', now(), now()),
      ('${IDS.dorH5}', '${IDS.userRep}', '${IDS.empresaX}', 'publicada',
       'Dor host5', 'Rep X', true, '${IDS.userAdmin}', now(), now())
    on conflict (id) do nothing;
  `)

  // dor_curso: vincular dorH1-H5 a engenharia_de_software (mesmo curso que dorGrupoGrande)
  await db.exec(`
    insert into public.dor_curso (dor_id, curso) values
      ('${IDS.dorH1}', 'engenharia_de_software'),
      ('${IDS.dorH2}', 'engenharia_de_software'),
      ('${IDS.dorH3}', 'engenharia_de_software'),
      ('${IDS.dorH4}', 'engenharia_de_software'),
      ('${IDS.dorH5}', 'engenharia_de_software')
    on conflict do nothing;
  `)

  // Projetos k-anon coordenadores (h1-h5 como host, 1 dor própria por projeto finalizado)
  // Grupo (papel='host', curso='engenharia_de_software') = 5 → passa HAVING count(*)>=5
  await db.exec(`
    insert into public.projeto (id, dor_id, status, host_coordenador_id, aprovado_em)
    values
      ('${IDS.projetoH1}', '${IDS.dorH1}', 'finalizado', '${IDS.h1}', now()),
      ('${IDS.projetoH2}', '${IDS.dorH2}', 'finalizado', '${IDS.h2}', now()),
      ('${IDS.projetoH3}', '${IDS.dorH3}', 'finalizado', '${IDS.h3}', now()),
      ('${IDS.projetoH4}', '${IDS.dorH4}', 'finalizado', '${IDS.h4}', now()),
      ('${IDS.projetoH5}', '${IDS.dorH5}', 'finalizado', '${IDS.h5}', now())
    on conflict (id) do nothing;
  `)

  // ── 12. Membro_equipe (userA nos projetos principais) ────────────────────
  await db.exec(`
    insert into public.membro_equipe (projeto_id, pessoa_id, papel_projeto) values
      ('${IDS.projetoFinalizado}', '${IDS.userA}',    'aluno'),
      ('${IDS.projetoFinalizado}', '${IDS.userCoord}','host'),
      ('${IDS.projetoEmExecucao}', '${IDS.userA}',    'aluno'),
      ('${IDS.projetoEmExecucao}', '${IDS.userCoord}','host')
    on conflict do nothing;
  `)

  // Grupo GRANDE (>= 5 alunos): m1..m5 + host no projetoGrupoGrande
  await db.exec(`
    insert into public.membro_equipe (projeto_id, pessoa_id, papel_projeto) values
      ('${IDS.projetoGrupoGrande}', '${IDS.userCoord}', 'host'),
      ('${IDS.projetoGrupoGrande}', '${IDS.m1}', 'aluno'),
      ('${IDS.projetoGrupoGrande}', '${IDS.m2}', 'aluno'),
      ('${IDS.projetoGrupoGrande}', '${IDS.m3}', 'aluno'),
      ('${IDS.projetoGrupoGrande}', '${IDS.m4}', 'aluno'),
      ('${IDS.projetoGrupoGrande}', '${IDS.m5}', 'aluno')
    on conflict do nothing;
  `)

  // Grupo PEQUENO (< 5 alunos): m1..m3 + host no projetoGrupoPequeno
  await db.exec(`
    insert into public.membro_equipe (projeto_id, pessoa_id, papel_projeto) values
      ('${IDS.projetoGrupoPequeno}', '${IDS.userCoord}', 'host'),
      ('${IDS.projetoGrupoPequeno}', '${IDS.m1}', 'aluno'),
      ('${IDS.projetoGrupoPequeno}', '${IDS.m2}', 'aluno'),
      ('${IDS.projetoGrupoPequeno}', '${IDS.m3}', 'aluno')
    on conflict do nothing;
  `)

  // Grupo de HOSTS (>= 5): h1-h5 cada um como host em projeto próprio finalizado
  // (dorGrupoGrande → engenharia_de_software); cria grupo (papel='host', curso='engenharia_de_software') = 5
  await db.exec(`
    insert into public.membro_equipe (projeto_id, pessoa_id, papel_projeto) values
      ('${IDS.projetoH1}', '${IDS.h1}', 'host'),
      ('${IDS.projetoH2}', '${IDS.h2}', 'host'),
      ('${IDS.projetoH3}', '${IDS.h3}', 'host'),
      ('${IDS.projetoH4}', '${IDS.h4}', 'host'),
      ('${IDS.projetoH5}', '${IDS.h5}', 'host')
    on conflict do nothing;
  `)

  // ── 13. Funcao_tarefa ────────────────────────────────────────────────────
  // userA: 1 aberta + 1 concluída no projetoFinalizado; 1 aberta no projetoEmExecucao
  await db.exec(`
    insert into public.funcao_tarefa (projeto_id, responsavel_id, titulo, concluida) values
      ('${IDS.projetoFinalizado}', '${IDS.userA}', 'Tarefa A finalizada', true),
      ('${IDS.projetoFinalizado}', '${IDS.userA}', 'Tarefa A aberta',     false),
      ('${IDS.projetoEmExecucao}', '${IDS.userA}', 'Tarefa A em exec',    false)
    on conflict do nothing;
  `)

  return { ids: IDS }
}
