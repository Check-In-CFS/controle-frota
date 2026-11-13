/** "Passo 1 de 2" com trilho de progresso em amarelo. */
export default function Passos({ atual, nomes }) {
  return (
    <div className="m-passos" role="group" aria-label={`Passo ${atual + 1} de ${nomes.length}: ${nomes[atual]}`}>
      <div className="m-passos-trilho" aria-hidden="true">
        {nomes.map((n, i) => <span key={n} data-ativo={i <= atual} />)}
      </div>
      <p className="m-titulo text-lg shrink-0 whitespace-nowrap">Passo {atual + 1}/{nomes.length}</p>
    </div>
  )
}
