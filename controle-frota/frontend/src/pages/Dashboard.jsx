export default function Dashboard() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-800 mb-1">Dashboard</h1>
      <p className="text-gray-500 text-sm mb-6">
        Visão geral da frota, atualizada em tempo real a partir dos módulos cadastrados.
      </p>
      <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center text-gray-400">
        Os cards de indicadores (Total de Máquinas, Ativas, Em Manutenção, etc.) entram aqui
        quando o endpoint <code className="bg-gray-100 px-1 rounded">/dashboard</code> do backend estiver pronto.
      </div>
    </div>
  )
}
