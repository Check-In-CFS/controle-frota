import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, LogOut, Truck } from 'lucide-react'
import { useAuth } from '../services/auth'

/** Cabeçalho das telas do celular: voltar ao início (quando não é o início), título, nome e Sair. */
export default function CelularCabecalho({ titulo, voltar = true }) {
  const { auth, logout } = useAuth()
  const navigate = useNavigate()

  function sair() {
    logout()
    navigate('/login')
  }

  return (
    <header className="bg-white border-b border-gray-200 px-3 py-3 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-1 min-w-0">
        {voltar ? (
          <Link to="/celular" aria-label="Voltar ao início" title="Voltar ao início" className="p-2 -ml-1 text-gray-600 rounded-lg active:bg-gray-100">
            <ArrowLeft size={22} />
          </Link>
        ) : (
          <Truck className="text-primary ml-1 mr-1 shrink-0" size={22} />
        )}
        <div className="min-w-0">
          <p className="font-semibold text-gray-800 text-sm leading-tight">{titulo}</p>
          <p className="text-xs text-gray-500 truncate">{auth?.nome}</p>
        </div>
      </div>
      <button onClick={sair} className="flex items-center gap-1.5 text-sm text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-50">
        <LogOut size={16} /> Sair
      </button>
    </header>
  )
}
