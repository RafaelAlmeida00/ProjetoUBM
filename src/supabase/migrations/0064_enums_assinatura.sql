-- 0064 — Enums da feature 006-proposta-assinatura
--
-- Cria os três tipos enumerados usados pelas tabelas E17/E18/E19 e pelas RPCs da 006.
-- Ordem (a→z dos valores):
--   status_assinatura : ciclo de vida da assinatura (E18)
--   tipo_documento    : categoria do documento (E17)
--   origem_assinatura : via de obtenção da assinatura — Caminho A ou B (E18/RN7b)
--
-- Rollback: drop type public.origem_assinatura, public.tipo_documento, public.status_assinatura;

create type public.status_assinatura as enum (
  'pendente',
  'enviada',
  'assinada',
  'recusada',
  'expirada',
  'cancelada'
);

create type public.tipo_documento as enum (
  'proposta',
  'contraproposta',
  'outro'
);

create type public.origem_assinatura as enum (
  'autentique',
  'upload_livre'
);
