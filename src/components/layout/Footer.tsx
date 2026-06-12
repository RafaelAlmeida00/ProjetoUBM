import Link from 'next/link'
import { Logo } from '@/components/brand/Logo'
import { PRIVACY_POLICY_URL } from '@/lib/config'

// Footer "carimbo de planta" (§ colofão).
export function Footer() {
  return (
    <footer className="ubm-footer ubm-mesh">
      <div className="ubm-footer-inner">
        <div className="ubm-footer-col">
          <Link href="/" aria-label="Plataforma UBM — início" className="ubm-header-brand">
            <Logo />
          </Link>
          <p className="ubm-footer-tese">&ldquo;Onde a dor encontra o talento.&rdquo;</p>
        </div>
        <div className="ubm-footer-col">
          <h4>Seções</h4>
          <Link href="/propor">Propor uma dor</Link>
          <Link href="/#case">O case</Link>
          <Link href="/#campus">Campus</Link>
          <Link href="/#contato">Contato</Link>
        </div>
        <div className="ubm-footer-col">
          <h4>Institucional</h4>
          <a href="https://www.ubm.br" target="_blank" rel="noopener noreferrer">ubm.br ↗</a>
          <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer">Política de privacidade ↗</a>
        </div>
        <div className="ubm-footer-col">
          <h4>Acesso</h4>
          <Link href="/login">Entrar ou cadastrar</Link>
          <Link href="/conta">Minha conta</Link>
        </div>
      </div>
      <div className="ubm-footer-bottom">
        <div className="ubm-footer-inner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gridTemplateColumns: 'unset' }}>
          <span className="ubm-cota ubm-cota--muted">© 2026 Plataforma UBM</span>
          <span className="ubm-cota ubm-cota--muted">Sul Fluminense</span>
        </div>
      </div>
    </footer>
  )
}
