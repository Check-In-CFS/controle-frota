import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ShieldAlert } from 'lucide-react'
import { useAuth } from '../services/auth'
import { listarMaquinas } from '../services/maquinas'
import { TIPOS_MANUTENCAO, criarManutencao } from '../services/manutencoes'

import CelularCabecalho from '../components/CelularCabecalho'
import Secao from '../components/celular/Secao'
import ListaMaquinas from '../components/celular/ListaMaquinas'
import { useErrosDeCampo } from '../hooks/useErrosDeCampo'
import { extrairMensagemErro } from '../services/api'

const HOJE = new Date().toISOString().slice(0, 10)

/** Registrar manutenção no celular: máquina, tipo, descrição e leitura atual (horímetro ou km). */
export default function RegistrarManutencao() {
  const { isDiretor } = useAuth()
  const raizRef = useRef(null)
  useErrosDeCampo(raizRef)

  const [maquinas, setMaquinas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [maquinaId, setMaquinaId] = useState('')
  const [tipo, setTipo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [leitura, setLeitura] = useState('')
  const [data, setData] = useState(HOJE)
  const [erro, setErro] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [registrada, setRegistrada] = useState(null)

  useEffect(() => {
    listarMaquinas({ apenas_disponiveis: true })
      .then(setMaquinas)
      .catch(() => setErro('Não foi possível carregar as máquinas. Tente de novo.'))
      .finally(() => setCarregando(false))
  }, [])

  const maquina = maquinas.find((m) => String(m.id) === String(maquinaId))
  const usaKm = maquina?.tipo === 'carro' // carro mede por km; as demais máquinas por horímetro
  const ultimaLeitura = maquina ? Number((usaKm ? maquina.km_atual : maquina.horimetro_atual) ?? 0) : 0
  const unidade = usaKm ? 'km' : 'h'

  async function registrar(e) {
    e.preventDefault()
    setErro(null)
    if (!maquinaId) return setErro('Selecione a máquina.')
    if (!tipo) return setErro('Escolha o tipo: preventiva ou corretiva.')
    if (descricao.trim().length < 5) return setErro('Descreva o que foi feito (pelo menos 5 letras).')
    if (data > HOJE) return setErro('A data não pode ser no futuro.')
    const valorLeitura = leitura === '' ? null : Number(leitura)
    if (valorLeitura !== null && valorLeitura < ultimaLeitura) {
      return setErro(`A leitura (${valorLeitura} ${unidade}) é menor que a última registrada (${ultimaLeitura} ${unidade}). Confira o número.`)
    }

    setSalvando(true)
    try {
      await criarManutencao({
        maquina_id: Number(maquinaId),
        data,
        tipo,
        descricao: descricao.trim(),
        horimetro: !usaKm ? valorLeitura : null,
        km: usaKm ? valorLeitura : null,
        status: 'concluida',
      })
      setRegistrada({ maquina: maquina.codigo, tipo })
    } catch (err) {
      setErro(extrairMensagemErro(err, 'Não foi possível registrar a manutenção.'))
    } finally {
      setSalvando(false)
    }
  }

  function nova() {
    setRegistrada(null); setMaquinaId(''); setTipo(''); setDescricao(''); setLeitura(''); setData(HOJE); setErro(null)
    window.scrollTo({ top: 0 })
  }

  return (
    <div ref={raizRef} className="m-app">
      <CelularCabecalho titulo="Registrar manutenção" />

      {isDiretor ? (
        <main className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-3">
          <ShieldAlert size={44} className="text-[#5b5f66]" />
          <p className="m-titulo text-2xl">Acesso somente para visualização</p>
          <p className="text-[#5b5f66]">O perfil de diretor não registra manutenções.</p>
        </main>
      ) : registrada ? (
        <main className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2 m-entrada">
          <span className="w-24 h-24 rounded-full bg-sucesso text-white flex items-center justify-center mb-2"><CheckCircle2 size={56} strokeWidth={2.2} /></span>
          <h1 className="m-titulo text-4xl">Manutenção registrada!</h1>
          <p className="text-[#5b5f66] text-lg">{registrada.maquina} · {registrada.tipo === 'preventiva' ? 'Preventiva' : 'Corretiva'}</p>
          <div className="w-full max-w-sm mt-8 space-y-3">
            <button onClick={nova} className="m-botao m-botao-primario">Registrar outra</button>
            <Link to="/celular" className="m-botao m-botao-contorno">Voltar ao início</Link>
          </div>
        </main>
      ) : (
        <form onSubmit={registrar} id="form-manutencao" className="m-conteudo">
          {erro && <div role="alert" className="m-aviso m-aviso-erro">{erro}</div>}

          <Secao numero={1} titulo="Máquina" obrigatorio>
            <ListaMaquinas maquinas={maquinas} escolhida={maquinaId} onEscolher={setMaquinaId} carregando={carregando} />
          </Secao>

          <Secao numero={2} titulo="Tipo" obrigatorio>
            <div className="grid grid-cols-2 gap-3">
              {TIPOS_MANUTENCAO.map((t) => (
                <button type="button" key={t.value} aria-pressed={tipo === t.value} onClick={() => setTipo(t.value)} className="m-opcao m-opcao-centro !min-h-[68px] !text-[19px]">
                  {t.label}
                </button>
              ))}
            </div>
          </Secao>

          <Secao numero={3} titulo="O que foi feito?" obrigatorio>
            <textarea
              required
              rows={4}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="m-input"
              placeholder="Ex: troca do óleo e do filtro hidráulico; cilindro com vazamento interno recuperado"
            />
          </Secao>

          <Secao numero={4} titulo={`${usaKm ? 'Quilometragem' : 'Horímetro'} atual`}>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={leitura}
              onChange={(e) => setLeitura(e.target.value)}
              className="m-input !text-[26px] font-bold"
              placeholder={maquina ? `Última: ${ultimaLeitura} ${unidade}` : 'Escolha a máquina primeiro'}
              aria-label={usaKm ? 'Quilometragem atual' : 'Horímetro atual'}
            />
            {maquina && <p className="m-ajuda">Última leitura registrada: <strong>{ultimaLeitura} {unidade}</strong>. Deixe em branco se não souber.</p>}
          </Secao>

          <Secao titulo="Data">
            <input required type="date" max={HOJE} value={data} onChange={(e) => setData(e.target.value)} className="m-input" aria-label="Data da manutenção" />
          </Secao>
        </form>
      )}

      {!registrada && !isDiretor && (
        <div className="m-barra">
          <button type="submit" form="form-manutencao" disabled={salvando} className="m-botao m-botao-primario">
            {salvando ? 'Registrando...' : 'Registrar manutenção'}
          </button>
        </div>
      )}
    </div>
  )
}
