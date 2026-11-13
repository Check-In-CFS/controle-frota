import { useState } from 'react'
import { Check, Search } from 'lucide-react'

/** Busca + lista de máquinas para escolher uma (botões grandes, o escolhido fica marcado). */
export default function ListaMaquinas({ maquinas, escolhida, onEscolher, carregando = false }) {
  const [filtro, setFiltro] = useState('')
  const lista = maquinas.filter((m) =>
    `${m.codigo} ${m.marca || ''} ${m.modelo || ''}`.toLowerCase().includes(filtro.trim().toLowerCase())
  )

  return (
    <div>
      <div className="relative mb-3">
        <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5b5f66]" aria-hidden="true" />
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar máquina"
          aria-label="Buscar máquina"
          className="m-input pl-12"
        />
      </div>
      {carregando && <p className="m-ajuda">Carregando máquinas...</p>}
      <ul className="space-y-2.5 max-h-72 overflow-y-auto -mx-1 px-1 py-1">
        {!carregando && lista.length === 0 && <li className="m-ajuda">Nenhuma máquina encontrada.</li>}
        {lista.map((m) => {
          const marcada = String(m.id) === String(escolhida)
          return (
            <li key={m.id}>
              <button type="button" className="m-opcao" aria-pressed={marcada} onClick={() => onEscolher(m.id)}>
                <span className="min-w-0">
                  <span className="block font-bold">{m.codigo}</span>
                  {(m.marca || m.modelo) && <span className="block text-[15px] font-medium text-[#5b5f66] truncate">{[m.marca, m.modelo].filter(Boolean).join(' ')}</span>}
                </span>
                {marcada && <span className="m-check"><Check size={16} strokeWidth={3} /></span>}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
