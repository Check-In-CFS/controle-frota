/** Esqueleto de carregamento: linhas cinza pulsando no lugar do conteúdo. */
export default function Carregando({ linhas = 3 }) {
  return (
    <div role="status" aria-label="Carregando" className="animate-pulse space-y-3 py-4 px-4">
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="h-10 bg-gray-100 rounded-lg" style={{ opacity: 1 - i * 0.18 }} />
      ))}
      <span className="sr-only">Carregando...</span>
    </div>
  )
}
