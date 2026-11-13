import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Castle, LogOut } from 'lucide-react'
import { useAuth } from '../services/auth'

/** Cabeçalho das telas do celular: marca (ou voltar), título, nome do usuário e Sair. Termina numa faixa de segurança. */
export default function CelularCabecalho({ titulo, voltar = true }) {
  const { auth, logout } = useAuth()
  const navigate = useNavigate()

  function sair() {
    logout()
    navigate('/login')
  }

  return (
    <header className="m-cabecalho">
      <div className="m-cabecalho-linha">
        <div className="flex items-center gap-3 min-w-0">
          {voltar ? (
            <Link to="/celular" aria-label="Voltar ao início" title="Voltar ao início" className="m-icone-botao"><ArrowLeft size={24} /></Link>
          ) : (
            <span className="m-marca" aria-hidden="true"><Castle size={24} strokeWidth={2.2} /></span>
          )}
          <div className="min-w-0">
            <p className="m-titulo text-[22px] truncate">{titulo}</p>
            <p className="text-[13px] text-white/70 truncate mt-0.5">{auth?.nome}</p>
          </div>
        </div>
        <button onClick={sair} className="m-sair"><LogOut size={18} /> Sair</button>
      </div>
      <div className="m-faixa" aria-hidden="true" />
    </header>
  )
}
