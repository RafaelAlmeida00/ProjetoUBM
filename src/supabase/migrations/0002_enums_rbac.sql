-- Migração 0002 — enums de RBAC e notificação (Plataforma UBM / feature 002)
-- Ver architecture.md §3.1. admin é FLAG (tabela admin_app), não valor de app_role (RN2).

create type app_role as enum ('aluno', 'representante', 'coordenador');

create type papel_empresa as enum ('representante', 'gestor');

create type tipo_notificacao as enum (
  'dor_aprovada_curso', 'indicacao_nova', 'proposta_recebida',
  'proposta_assinada', 'contraproposta', 'status_mudou', 'merge_empresa',
  'verificacao_conta'
);
