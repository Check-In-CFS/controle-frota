import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, CheckCircle2, ShieldAlert } from 'lucide-react'
import { useAuth } from '../services/auth'
import { listarMaquinas } from '../services/maquinas'
import { TIPOS_MANUTENCAO, criarManutencao } from '../services/manutencoes'
import { extrairMensagemErro } from '../services/notasFiscais'
import CelularCabecalho from '../components/CelularCabecalho'
import { useErrosDeCampo } from '../hooks/useErrosDeCampo'

const HOJE = new Date().toISOString().slice(0, 10)

/** Registrar manutenção no celular: máquina, tipo, descrição e leitura atual (horímetro ou km). */
export default function RegistrarManutencao() {
  const { isDiretor } = useAuth()
  const raizRef = useRef(null)
  useErrosDeCampo(raizRef)

  const [maquinas, setMaquinas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState('')
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

  const filtradas = maquinas.filter((m) =>
    `${m.codigo} ${m.marca || ''} ${m.modelo || ''}`.toLowerCase().includes(filtro.trim().toLowerCase())
  )

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
    setRegistrada(null); setMaquinaId(''); setTipo(''); setDescricao(''); setLeitura(''); setData(HOJE); setErro(null); setFiltro('')
    window.scrollTo({ top: 0 })
  }

  return (
    <div ref={raizRef} className="min-h-screen bg-gray-50 flex flex-col">
      <CelularCabecalho titulo="Registrar manutenção" />

      {isDiretor ? (
        <main className="flex-1 flex flex-col items-center justify-center text-center px-6 text-gray-600">
          <ShieldAlert size={40} className="text-gray-500 mb-3" />
          <p className="font-medium text-gray-800">Acesso somente para visualização</p>
          <p className="text-sm mt-1">O perfil de diretor não registra manutenções.</p>
        </main>
      ) : registrada ? (
        <main className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <CheckCircle2 size={56} className="text-green-600 mb-3" />
          <h1 className="text-xl font-semibold text-gray-800">Manutenção registrada!</h1>
          <p className="text-sm text-gray-600 mt-1">{registrada.maquina} · {registrada.tipo === 'preventiva' ? 'Preventiva' : 'Corretiva'}</p>
          <button onClick={nova} className="mt-8 w-full max-w-xs bg-primary text-white py-4 rounded-xl text-base font-semibold">Registrar outra</button>
          <Link to="/celular" className="mt-3 w-full max-w-xs text-center border border-gray-200 text-gray-700 py-4 rounded-xl text-base font-medium bg-white">Voltar ao início</Link>
        </main>
      ) : (
        <form onSubmit={registrar} id="form-manutencao" className="flex-1 px-4 py-4 pb-28 space-y-6">
          {erro && <div role="alert" className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{erro}</div>}

          <section>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">1. Máquina *</h2>
            <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar máquina" aria-label="Buscar máquina" className="input mb-2" />
            {carregando && <p className="text-sm text-gray-500 py-2">Carregando máquinas...</p>}
            <ul className="space-y-2 max-h-60 overflow-y-auto">
              {!carregando && filtradas.length === 0 && <li className="text-sm text-gray-500 py-2">Nenhuma máquina encontrada.</li>}
              {filtradas.map((m) => {
                const marcada = String(m.id) === String(maquinaId)
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      aria-pressed={marcada}
                      onClick={() => setMaquinaId(m.id)}
                      className={`w-full flex items-center justify-between text-left px-4 py-3.5 rounded-lg border text-sm ${marcada ? 'border-primary bg-indigo-50 text-primary' : 'border-gray-200 bg-white text-gray-700'}`}
                    >
                      <span>
                        <span className="font-medium">{m.codigo}</span>
                        {(m.marca || m.modelo) && <span className="text-gray-500"> · {[m.marca, m.modelo].filter(Boolean).join(' ')}</span>}
                      </span>
                      {marcada && <Check size={18} />}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">2. Tipo *</h2>
            <div className="grid grid-cols-2 gap-3">
              {TIPOS_MANUTENCAO.map((t) => (
                <button
                  type="button"
                  key={t.value}
                  aria-pressed={tipo === t.value}
                  onClick={() => setTipo(t.value)}
                  className={`py-4 rounded-xl text-base font-semibold border ${tipo === t.value ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-200'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">3. O que foi feito? *</h2>
            <textarea
              required
              rows={4}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="input"
              placeholder="Ex: troca do óleo e do filtro hidráulico; cilindro com vazamento interno recuperado"
            />
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">4. {usaKm ? 'Quilometragem' : 'Horímetro'} atual</h2>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={leitura}
              onChange={(e) => setLeitura(e.target.value)}
              className="input text-lg"
              placeholder={maquina ? `Última: ${ultimaLeitura} ${unidade}` : 'Escolha a máquina primeiro'}
              aria-label={usaKm ? 'Quilometragem atual' : 'Horímetro atual'}
            />
            {maquina && <p className="text-xs text-gray-500 mt-1">Última leitura registrada: {ultimaLeitura} {unidade}. Deixe em branco se não souber.</p>}
          </section>

          <section>
            <label className="block">
              <span className="block text-sm font-semibold text-gray-700 mb-2">Data</span>
              <input required type="date" max={HOJE} value={data} onChange={(e) => setData(e.target.value)} className="input" />
            </label>
          </section>
        </form>
      )}

      {!registrada && !isDiretor && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button type="submit" form="form-manutencao" disabled={salvando} className="w-full bg-primary text-white py-3.5 rounded-xl text-base font-semibold disabled:opacity-60">
            {salvando ? 'Registrando...' : 'Registrar manutenção'}
          </button>
        </div>
      )}
    </div>
  )
}
