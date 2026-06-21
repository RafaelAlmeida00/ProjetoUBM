import type { Metadata } from 'next'
import { Geist, Geist_Mono, Fraunces } from 'next/font/google'
import './globals.css'
import { AppProviders } from '@/components/app/AppProviders'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { PaletteStyle } from '@/components/theme/PaletteStyle'
import { PaletteFavicon } from '@/components/theme/PaletteFavicon'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })
const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  display: 'swap',
  style: ['normal', 'italic'],
})

export const metadata: Metadata = {
  title: 'Plataforma UBM — onde a dor encontra o talento',
  description:
    'Empresas e órgãos do Sul Fluminense propõem dores reais; os cursos da UBM resolvem em projetos de extensão. Proponha a sua.',
}

// Lê o usuário da sessão (cookies) para o header público e para resolução de paleta.
// Sem env Supabase (dev/test) → null (header anônimo, paleta → oficial ativa).
async function lerUsuarioSessao(): Promise<{ uid: string | null; nome: string | null }> {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { uid: null, nome: null }
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>
    const nome =
      (meta.full_name as string) || (meta.name as string) || user.email || 'Minha conta'
    return { uid: user.id, nome }
  } catch {
    return { uid: null, nome: null }
  }
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { uid, nome } = await lerUsuarioSessao()
  const headerUser = nome ? { nome } : null
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <head>
        {/* T15: paleta resolvida no servidor → cor no 1º byte (0 FOUC por construção) */}
        <PaletteStyle uid={uid} />
        {/* Favicon da marca conforme a paleta ativa (azul/marsala), resolvido no servidor */}
        <PaletteFavicon uid={uid} />
      </head>
      <body className="min-h-full flex flex-col">
        <AppProviders>
          <Header user={headerUser} />
          <main className="flex flex-1 flex-col">{children}</main>
          <Footer />
        </AppProviders>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
