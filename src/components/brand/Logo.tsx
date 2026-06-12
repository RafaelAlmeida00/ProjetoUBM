import Image from 'next/image'

interface LogoProps {
  variant?: 'azul' | 'marsala'
  className?: string
  priority?: boolean
}

// Assets de marca recortados (padding removido via sharp.trim — ver scripts). Fundo branco; object-contain.
const SRC: Record<NonNullable<LogoProps['variant']>, { src: string; w: number; h: number }> = {
  azul: { src: '/ubm-logo-azul.png', w: 227, h: 88 },
  marsala: { src: '/ubm-logo-marsala.png', w: 301, h: 134 },
}

export function Logo({ variant = 'azul', className, priority = false }: LogoProps) {
  const { src, w, h } = SRC[variant]
  return (
    <span className={`ubm-logo ${className ?? ''}`}>
      <Image src={src} alt="UBM" width={w} height={h} priority={priority} />
    </span>
  )
}
