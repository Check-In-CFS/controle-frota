/** Bloco numerado das telas do celular: número em círculo escuro + título em caixa alta. */
export default function Secao({ numero, titulo, obrigatorio = false, children, className = '' }) {
  return (
    <section className={`m-secao m-entrada ${className}`}>
      <header className="m-secao-cab">
        {numero != null && <span className="m-numero" aria-hidden="true">{numero}</span>}
        <h2>{titulo}{obrigatorio && <span className="text-perigo" aria-label=" obrigatório"> *</span>}</h2>
      </header>
      {children}
    </section>
  )
}
