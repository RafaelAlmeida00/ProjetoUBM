import Link from 'next/link'
import Image from 'next/image'
import { Node } from '@/components/brand/Node'
import { QuickLogin } from '@/components/auth/QuickLogin'

// Depoimentos do case (foto temporária person.png; textos placeholder até os reais).
const ALUNOS = [
  { fala: 'Trabalhar numa dor real da cidade mudou a forma como eu programo — virou propósito, não exercício.' },
  { fala: 'Saí da faculdade com um sistema de verdade no portfólio e gente usando o que eu construí.' },
  { fala: 'Aprendi a ouvir o cliente antes de programar. Foi a melhor disciplina do curso.' },
]
const PREFEITURA = [
  { fala: 'Levamos uma dor que não tínhamos como resolver e recebemos uma solução pensada com cuidado.' },
  { fala: 'O cidadão sentiu a diferença. E aproximou de vez a prefeitura da universidade.' },
]

export default function Home() {
  return (
    <div className="ubm-landing">
      {/* ───────── HERO + QUICK-LOGIN ───────── */}
      <section id="dor" className="ubm-hero ubm-mesh">
        <div className="ubm-territory-dor" aria-hidden="true" />
        <div className="ubm-territory-talento" aria-hidden="true" />
        <div className="ubm-seam" aria-hidden="true" />
        <Node className="ubm-node--watermark" />

        <div className="ubm-hero-left">
          <span className="ubm-eyebrow ubm-cota">Extensão que resolve</span>
          <h1 className="ubm-hero-title">
            Sua empresa tem uma <b>dor.</b><br />
            A UBM tem <b>talento</b> que <span className="charneira">encaixa.</span>
          </h1>
          <p className="ubm-hero-abstract">
            Conectamos empresas, startups e órgãos públicos do Sul Fluminense aos cursos da UBM.
            Conte a sua dor — ela pode virar um projeto de extensão, sem custo.
          </p>
          <div className="ubm-hero-cta">
            <Link href="/propor" className="ubm-btn ubm-btn-primary">Proponha sua dor →</Link>
            <span className="ubm-hero-hint">Leva cerca de 2 minutos</span>
          </div>
        </div>

        <div className="ubm-hero-right">
          <QuickLogin />
        </div>
      </section>

      {/* ───────── DORES PÚBLICAS (CTA vitrine) ───────── */}
      <section aria-labelledby="dores-vitrine-heading" className="ubm-landing-dores">
        <div className="ubm-landing-dores-copy">
          <h2 id="dores-vitrine-heading">Veja as dores reais que estamos resolvendo</h2>
          <p>
            Empresas e órgãos públicos do Sul Fluminense já trouxeram seus desafios para a UBM.
            Confira as dores publicadas e como a extensão universitária gera impacto real.
          </p>
        </div>
        <Link href="/dores" className="ubm-btn ubm-btn-secondary">
          Ver todas as dores →
        </Link>
      </section>

      {/* ───────── CASE ───────── */}
      <div className="ubm-divider"><span className="ubm-cota">O case · Governo Presente!</span></div>
      <section id="case" className="ubm-section">
        <div className="ubm-case">
          <figure className="ubm-case-figure">
            <div className="ubm-overlap">
              <div className="ubm-machined ubm-case-frame">
                <Image
                  src="/bmcase.png"
                  alt="App Governo Presente!, da Prefeitura de Barra Mansa, criado com a UBM"
                  width={1350}
                  height={1688}
                  className="ubm-case-img"
                />
              </div>
            </div>
            <figcaption className="ubm-eyebrow ubm-cota">App “Governo Presente!”</figcaption>
          </figure>

          <div>
            <blockquote className="ubm-quote">
              &ldquo;A Prefeitura de Barra Mansa levou uma dor real ao curso de Engenharia de Software
              da UBM — e os alunos criaram o <b>Governo Presente!</b>, um app que integra os serviços
              ao cidadão.&rdquo;
            </blockquote>

            <div className="ubm-testimonials">
              <span className="ubm-cota col-span-full">O lado talento</span>
              {ALUNOS.map((t, i) => (
                <article key={i} className="ubm-testimonial ubm-machined">
                  <div className="ubm-testimonial-head">
                    <Image src="/person.png" alt="" width={64} height={64} className="ubm-avatar-photo" />
                    <div>
                      <div className="ubm-testimonial-name">Aluno(a)</div>
                      <div className="ubm-cota ubm-cota--muted">Eng. de Software</div>
                    </div>
                  </div>
                  <p>&ldquo;{t.fala}&rdquo;</p>
                </article>
              ))}
              <span className="ubm-cota col-span-full mt-2">O lado que tinha a dor</span>
              {PREFEITURA.map((t, i) => (
                <article key={i} className="ubm-testimonial ubm-testimonial--prefeitura ubm-machined">
                  <div className="ubm-testimonial-head">
                    <Image src="/person.png" alt="" width={64} height={64} className="ubm-avatar-photo" />
                    <div>
                      <div className="ubm-testimonial-name">Servidor(a)</div>
                      <div className="ubm-cota ubm-cota--muted">Prefeitura de Barra Mansa</div>
                    </div>
                  </div>
                  <p>&ldquo;{t.fala}&rdquo;</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ───────── CAMPUS ───────── */}
      <div className="ubm-divider"><span className="ubm-cota">O campus</span></div>
      <section id="campus" className="ubm-section">
        <div className="ubm-campus">
          <div className="ubm-map-frame ubm-machined">
            <iframe
              title="Mapa do campus da UBM em Barra Mansa"
              src="https://www.google.com/maps?q=R.+Ver.+Pinho+de+Carvalho,+267+-+Centro,+Barra+Mansa+-+RJ,+27330-550&output=embed"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <div>
            <h2 className="ubm-quote mb-3 not-italic text-[clamp(1.5rem,3vw,2rem)]">
              Uma instituição do Sul Fluminense, de pé no polo industrial.
            </h2>
            <p className="mb-2 leading-[1.6] text-[hsl(var(--muted-foreground))]">
              A UBM forma profissionais em Barra Mansa há décadas. Conheça a estrutura, os cursos e a história.
            </p>
            <p className="ubm-cota ubm-cota--muted mb-4">
              R. Ver. Pinho de Carvalho, 267 — Centro, Barra Mansa/RJ
            </p>
            <a href="https://www.ubm.br" target="_blank" rel="noopener noreferrer" className="ubm-link">
              Conheça a UBM ↗
            </a>
            <div className="ubm-campus-gallery">
              <div className="ubm-machined ubm-campus-cell">
                <Image src="/ubmplace.png" alt="Campus da UBM" width={2560} height={1153} className="ubm-campus-img" />
              </div>
              <div className="ubm-machined ubm-campus-cell">
                <Image src="/ubmplace2.png" alt="Campus da UBM" width={194} height={259} className="ubm-campus-img" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── CONTATO ───────── */}
      <div className="ubm-divider"><span className="ubm-cota">Fale com a gente</span></div>
      <section id="contato" className="ubm-section">
        <div className="ubm-contact-list">
          <div className="ubm-contact-row">
            <span className="ubm-cota">E-mail</span>
            <a href="mailto:extensao@ubm.br">extensao@ubm.br</a>
          </div>
          <div className="ubm-contact-row">
            <span className="ubm-cota">Telefone</span>
            <a href="tel:+552433000000">(24) 3300-0000</a>
          </div>
        </div>
        <div className="mt-8">
          <Link href="/propor" className="ubm-btn ubm-btn-primary">Começar agora →</Link>
        </div>
      </section>
    </div>
  )
}
