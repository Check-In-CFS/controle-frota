import { Link } from 'react-router-dom'
import { FileText, Wrench, ChevronRight, ShieldAlert } from 'lucide-react'
import { useAuth } from '../services/auth'
import CelularCabecalho from '../components/CelularCabecalho'

/** Início no celular: as duas coisas que o mecânico faz pelo aparelho. */
export default function CelularInicio() {
  const { auth, isDiretor } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <CelularCabecalho titulo="Controle de Frota" voltar={false} />

      {isDiretor ? (
        <main className="flex-1 flex flex-col items-center justify-center text-center px-6 text-gray-600">
          <ShieldAlert size={40} className="text-gray-500 mb-3" />
          <p className="font-medium text-gray-800">Acesso somente para visualização</p>
          <p className="text-sm mt-1">No celular só é possível lançar notas e registrar manutenções, e o perfil de diretor não lança. Acesse o sistema pelo computador.</p>
        </main>
      ) : (
        <main className="flex-1 px-4 py-6 space-y-4">
          <p className="text-gray-600 text-sm">Olá, {auth?.nome?.split(' ')[0]}. O que você quer fazer?</p>

          <Link to="/lancar-nota" className="flex items-center gap-4 bg-white border border-gray-200 rounded-2xl p-5 shadow-sm active:bg-gray-50">
            <span className="w-14 h-14 rounded-xl bg-indigo-50 text-primary flex items-center justify-center shrink-0"><FileText size={28} /></span>
            <span className="flex-1">
              <span className="block text-lg font-semibold text-gray-800">Lançar nota fiscal</span>
              <span className="block text-sm text-gray-500">Foto da nota, máquina e motivo</span>
            </span>
            <ChevronRight className="text-gray-500" />
          </Link>

          <Link to="/registrar-manutencao" className="flex items-center gap-4 bg-white border border-gray-200 rounded-2xl p-5 shadow-sm active:bg-gray-50">
            <span className="w-14 h-14 rounded-xl bg-indigo-50 text-primary flex items-center justify-center shrink-0"><Wrench size={28} /></span>
            <span className="flex-1">
              <span className="block text-lg font-semibold text-gray-800">Registrar manutenção</span>
              <span className="block text-sm text-gray-500">Máquina, tipo, o que foi feito e leitura</span>
            </span>
            <ChevronRight className="text-gray-500" />
          </Link>
        </main>
      )}
    </div>
  )
}
