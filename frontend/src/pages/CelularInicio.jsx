import { Link } from 'react-router-dom'
import { ArrowRight, FileText, Wrench, ShieldAlert } from 'lucide-react'
import { useAuth } from '../services/auth'
import CelularCabecalho from '../components/CelularCabecalho'

function saudacao() {
  const h = new Date().getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

function dataPorExtenso() {
  const t = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  return t.charAt(0).toUpperCase() + t.slice(1) // só a 1ª letra ("Sexta-feira, 13 de novembro")
}

/** Início no celular: as duas coisas que o mecânico faz pelo aparelho, em dois botões enormes. */
export default function CelularInicio() {
  const { auth, isDiretor } = useAuth()
  const primeiroNome = auth?.nome?.split(' ')[0]

  return (
    <div className="m-app">
      <CelularCabecalho titulo="Controle de Frota" voltar={false} />

      {isDiretor ? (
        <main className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-3">
          <ShieldAlert size={44} className="text-[#5b5f66]" />
          <p className="m-titulo text-2xl">Acesso somente para visualização</p>
          <p className="text-[#5b5f66]">No celular só é possível lançar notas e registrar manutenções, e o perfil de diretor não lança. Acesse o sistema pelo computador.</p>
        </main>
      ) : (
        <main className="m-conteudo" style={{ paddingBottom: 32 }}>
          <div className="m-entrada pt-2">
            <p className="text-[15px] font-semibold text-[#5b5f66]">{dataPorExtenso()}</p>
            <h1 className="m-titulo text-[44px] mt-1">{saudacao()},<br />{primeiroNome}</h1>
          </div>

          <Link to="/lancar-nota" className="m-tile m-entrada bg-castelo text-tinta" style={{ animationDelay: '80ms' }}>
            <FileText size={150} strokeWidth={1.5} className="m-tile-marca" aria-hidden="true" />
            <span className="w-12 h-12 rounded-xl bg-tinta text-castelo flex items-center justify-center"><FileText size={26} /></span>
            <span>
              <span className="block m-titulo text-[34px]">Lançar nota fiscal</span>
              <span className="flex items-end justify-between gap-3 mt-1.5">
                <span className="text-[16px] font-medium leading-snug">Tire a foto da nota, escolha a máquina e o motivo.</span>
                <span className="w-11 h-11 rounded-full bg-tinta text-castelo flex items-center justify-center shrink-0"><ArrowRight size={22} /></span>
              </span>
            </span>
          </Link>

          <Link to="/registrar-manutencao" className="m-tile m-entrada bg-tinta text-white" style={{ animationDelay: '160ms' }}>
            <Wrench size={150} strokeWidth={1.5} className="m-tile-marca" aria-hidden="true" />
            <span className="w-12 h-12 rounded-xl bg-castelo text-tinta flex items-center justify-center"><Wrench size={26} /></span>
            <span>
              <span className="block m-titulo text-[34px]">Registrar manutenção</span>
              <span className="flex items-end justify-between gap-3 mt-1.5">
                <span className="text-[16px] font-medium leading-snug text-white/80">Máquina, tipo, o que foi feito e a leitura do horímetro.</span>
                <span className="w-11 h-11 rounded-full bg-castelo text-tinta flex items-center justify-center shrink-0"><ArrowRight size={22} /></span>
              </span>
            </span>
          </Link>

          <p className="m-titulo text-[15px] text-[#8a8d93] text-center mt-auto pt-6 tracking-[0.14em]">Castelo Forte · Frota</p>
        </main>
      )}
    </div>
  )
}
