import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, X } from 'lucide-react'
import { assinarToasts } from '../services/toast'

const DURACAO_MS = 3500

/** Mostra os avisos curtos (salvo, excluído...) no canto da tela. Montado uma vez no App. */
export default function Toaster() {
  const [itens, setItens] = useState([])

  useEffect(() => {
    return assinarToasts((t) => {
      setItens((atual) => [...atual.slice(-2), t])
      setTimeout(() => setItens((atual) => atual.filter((i) => i.id !== t.id)), DURACAO_MS)
    })
  }, [])

  function fechar(id) {
    setItens((atual) => atual.filter((i) => i.id !== id))
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-[200] bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:w-80 flex flex-col gap-2 pointer-events-none"
    >
      {itens.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-3 rounded-lg shadow-lg px-4 py-3 text-sm text-white ${
            t.tipo === 'erro' ? 'bg-red-600' : 'bg-gray-800'
          }`}
        >
          {t.tipo === 'erro' ? <AlertCircle size={18} className="shrink-0" /> : <CheckCircle2 size={18} className="shrink-0 text-green-400" />}
          <span className="flex-1">{t.mensagem}</span>
          <button onClick={() => fechar(t.id)} aria-label="Fechar aviso" className="shrink-0 opacity-70 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}
