'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  FileQuestion,
  FolderKanban,
  Building2,
  Users,
  ClipboardList,
  DatabaseZap,
  PlusCircle,
  ShieldAlert,
  UserCircle,
  LogOut,
  Star,
  Bell,
  Palette,
} from 'lucide-react'
import { logoutCompleto } from '@/lib/auth/logout'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  roles?: string[]
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/app', label: 'Bancada', icon: <LayoutDashboard aria-hidden /> },
  { href: '/app/dores', label: 'Dores', icon: <FileQuestion aria-hidden /> },
  // Lista de projetos → Sala da equipe (eleger host, compor/fechar, reabrir indicações)
  { href: '/app/projetos', label: 'Projetos', icon: <FolderKanban aria-hidden /> },
  // ADR-0002: /casos unificado em /dores — item "Casos" removido do NavRail
  // 005: auto-indicação — só aluno e coordenador (representante não se indica)
  {
    href: '/app/indicacoes',
    label: 'Indicações',
    icon: <Star aria-hidden />,
    roles: ['aluno', 'coordenador'],
  },
  // 005: central de notificações — todos os logados
  { href: '/app/notificacoes', label: 'Notificações', icon: <Bell aria-hidden /> },
  {
    href: '/app/dores/nova',
    label: 'Propor dor',
    icon: <PlusCircle aria-hidden />,
    roles: ['representante'],
  },
  {
    href: '/admin/dores',
    label: 'Moderar dores',
    icon: <ShieldAlert aria-hidden />,
    adminOnly: true,
  },
  { href: '/admin/usuarios', label: 'Usuários', icon: <Users aria-hidden />, adminOnly: true },
  { href: '/admin/empresas', label: 'Empresas', icon: <Building2 aria-hidden />, adminOnly: true },
  {
    href: '/admin/auditoria',
    label: 'Auditoria',
    icon: <ClipboardList aria-hidden />,
    adminOnly: true,
  },
  {
    href: '/admin/backfill',
    label: 'Backfill',
    icon: <DatabaseZap aria-hidden />,
    adminOnly: true,
  },
  // 007: editor de paletas — só admin (RN6/NC-1: sem troca por usuário)
  {
    href: '/admin/paletas',
    label: 'Paletas',
    icon: <Palette aria-hidden />,
    adminOnly: true,
  },
]

interface NavRailProps {
  /** Papel único (legado — mantido para compat com testes existentes) */
  role?: string
  /** Papéis reais do usuário (preferencial — lidos de papel_usuario, não do JWT claim) */
  papeis?: string[]
  isAdmin?: boolean
  isOpen?: boolean
  onClose?: () => void
}

/** Item "Sair" do bloco Meu Perfil — reusa a lógica de logout (signOut + volta à landing). */
function LogoutItem({ onClose }: { onClose?: () => void }) {
  const sair = async () => {
    onClose?.()
    await logoutCompleto()
  }
  return (
    <button type="button" className="ubm-navrail-item" onClick={sair} aria-label="Sair da conta">
      <LogOut aria-hidden />
      <span>Sair</span>
    </button>
  )
}

export function NavRail({ role, papeis, isAdmin, onClose }: NavRailProps) {
  const pathname = usePathname()

  // BUG D1: usa `papeis` (array real de papel_usuario) quando disponível;
  // cai para `role` legado para compat com testes e render sem supabase.
  const roleSet = papeis ?? (role ? [role] : [])

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.adminOnly) return isAdmin
    if (item.roles) return item.roles.some((r) => roleSet.includes(r))
    return true
  })

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const contaAtiva = isActive('/app/conta')

  return (
    <nav className="ubm-navrail-nav" aria-label="Navegação principal">
      {/* ── Bloco A: navegação (descendo, rola se faltar espaço) ── */}
      <div className="ubm-navrail-top">
        {isAdmin && (
          <div data-testid="mode-chip" className="ubm-navrail-mode">
            <ShieldAlert aria-hidden size={12} />
            MODO MODERAÇÃO
          </div>
        )}
        <ul className="ubm-navrail" role="list">
          {visibleItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="ubm-navrail-item"
                aria-current={isActive(item.href) ? 'page' : undefined}
                onClick={onClose}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* ── Bloco B: Meu Perfil, fixo no rodapé, empilhando para cima ── */}
      <div className="ubm-navrail-bottom">
        <ul className="ubm-navrail-perfil" role="list">
          {/* âncora (base) — Meu Perfil */}
          <li>
            <Link
              href="/app/conta"
              className="ubm-navrail-item"
              aria-current={contaAtiva ? 'page' : undefined}
              onClick={onClose}
            >
              <UserCircle aria-hidden />
              <span>Meu Perfil</span>
            </Link>
          </li>
          {/* sobe via column-reverse — Sair */}
          <li>
            <LogoutItem onClose={onClose} />
          </li>
        </ul>
      </div>
    </nav>
  )
}
