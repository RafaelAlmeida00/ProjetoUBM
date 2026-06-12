'use client'
import { useEffect, useState } from 'react'
import {
  STEPS,
  initialState,
  canAdvance,
  next,
  prev,
  progress,
  canSubmit,
  type WizardState,
} from '@/lib/wizard/machine'
import type { WizardField } from '@/lib/wizard/steps.config'
import { loadDraft, saveDraft, clearDraft } from '@/lib/wizard/draft'
import type { NewProposal } from '@/lib/proposal'
import type { CursoUbm } from '@/lib/courses'
import { WizardStep } from './WizardStep'
import { ProgressIndicator } from './ProgressIndicator'
import { CourseMultiSelect } from '../course/CourseMultiSelect'
import { ConsentGate } from '../consent/ConsentGate'

interface WizardProps {
  onComplete: (data: NewProposal) => void
}

export function Wizard({ onComplete }: WizardProps) {
  const [state, setState] = useState<WizardState>(() => initialState())

  // Reidrata o rascunho (AC3) só no cliente. setState no effect é intencional: sincroniza
  // estado vindo de sistema externo (localStorage), SSR-safe (não pode ir no initializer).
  useEffect(() => {
    const draft = loadDraft()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (draft) setState((s) => ({ ...s, data: { ...s.data, ...draft } }))
  }, [])

  const step = STEPS[state.stepIndex]
  const isLast = state.stepIndex === STEPS.length - 1

  const update = (patch: Partial<NewProposal>) =>
    setState((s) => {
      const data = { ...s.data, ...patch }
      saveDraft(data)
      return { ...s, data }
    })

  const goNext = () => setState((s) => (canAdvance(s) ? next(s) : s))
  const goPrev = () => setState((s) => prev(s))
  const submit = () => {
    if (canSubmit(state.data)) {
      onComplete(state.data as NewProposal)
      clearDraft()
    }
  }

  return (
    <div className="ubm-wizard">
      <ProgressIndicator value={progress(state)} />
      <WizardStep label={step.label} microcopy={step.microcopy}>
        {renderField(step.field, state.data, update)}
      </WizardStep>
      <div className="ubm-wizard-actions">
        {state.stepIndex > 0 && (
          <button type="button" onClick={goPrev}>
            Voltar
          </button>
        )}
        {!isLast && (
          <button type="button" onClick={goNext} disabled={!canAdvance(state)}>
            Continuar
          </button>
        )}
        {isLast && (
          <button type="button" onClick={submit} disabled={!canSubmit(state.data)}>
            Enviar
          </button>
        )}
      </div>
    </div>
  )
}

function renderField(
  field: WizardField,
  data: Partial<NewProposal>,
  update: (patch: Partial<NewProposal>) => void,
) {
  switch (field) {
    case 'repNome':
      return (
        <input type="text" aria-label="Nome do representante" value={data.repNome ?? ''} onChange={(e) => update({ repNome: e.target.value })} />
      )
    case 'empresa':
      return (
        <input type="text" aria-label="Empresa" value={data.empresa ?? ''} onChange={(e) => update({ empresa: e.target.value })} />
      )
    case 'departamento':
      return (
        <input type="text" aria-label="Departamento (opcional)" value={data.departamento ?? ''} onChange={(e) => update({ departamento: e.target.value })} />
      )
    case 'cargo':
      return (
        <input type="text" aria-label="Cargo (opcional)" value={data.cargo ?? ''} onChange={(e) => update({ cargo: e.target.value })} />
      )
    case 'dor':
      return (
        <textarea aria-label="Descrição da dor" value={data.dor ?? ''} onChange={(e) => update({ dor: e.target.value })} />
      )
    case 'cursos':
      return <CourseMultiSelect value={data.cursos ?? []} onChange={(v: CursoUbm[]) => update({ cursos: v })} />
    case 'consent':
      return <ConsentGate checked={data.consent === true} onChange={(v: boolean) => update({ consent: v })} />
    default:
      return null
  }
}
