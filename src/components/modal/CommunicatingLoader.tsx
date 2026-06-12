'use client'
import { Node } from '@/components/brand/Node'

// Loader "comunicante" (engenharia social): o nó UBM girando = "o sistema está usinando seu espaço".
export function CommunicatingLoader({ message }: { message: string }) {
  return (
    <div className="ubm-loader" role="status" aria-live="polite">
      <Node className="ubm-spinner" />
      <span className="ubm-loader-msg">{message}</span>
    </div>
  )
}
