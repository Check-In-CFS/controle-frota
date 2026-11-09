import { useEffect, useState, useCallback } from 'react'
import { Search, Plus, FileText } from 'lucide-react'
import { listarMaquinas } from '../services/maquinas'
import { api } from '../services/api'
import { listarNotasFiscais, criarNotaFiscal, labelTipoNota } from '../services/notasFiscais'
import NotaFiscalRapidaModal from '../components/NotaFiscalRapidaModal'
import NotaFiscalDetalheModal from '../components/NotaFiscalDetalheModal'
import Carregando from '../components/Carregando'

function formatarData(iso) {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

function formatarMoeda(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Visão de Notas Fiscais do mecânico: lança notas e consulta as já lançadas (somente leitura). */
export default function NotasFiscaisMecanico() {
  const [notas, setNotas] = useState([])
  const [maquinas, setMaquinas] = useState([])
  const [fornecedores, setFornecedores] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [busca, setBusca] = useState('')
  const [lancando, setLancando] = useState(false)
  const [visualizando, setVisualizando] = useState(null)

  useEffect(() => {
    listarMaquinas({ apenas_disponiveis: true }).then(setMaquinas).catch(() => {})
    api.get('/fornecedores').then((r) => setFornecedores(r.data)).catch(() => {})
  }, [])

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      setNotas(await listarNotasFiscais({ busca: busca || undefined }))
    } catch {
      setErro('Não foi possível carregar as notas fiscais.')
    } finally {
      setCarregando(false)
    }
  }, [busca])

  useEffect(() => {
    const timer = setTimeout(carregar, 300)
    return () => clearTimeout(timer)
  }, [carregar])

  async function lancar(payload) {
    await criarNotaFiscal(payload)
    setLancando(false)
    carregar()
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-800 mb-4">Notas Fiscais</h1>

      <button
        onClick={() => setLancando(true)}
        className="w-full flex items-center justify-center gap-2 bg-primary text-white py-4 rounded-xl text-base font-semibold hover:bg-primary-dark mb-5 shadow-sm"
      >
        <Plus size={20} /> Lançar nota fiscal
      </button>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          inputMode="numeric"
          aria-label="Pesquisar por número da nota"
          placeholder="Pesquisar por número"
          className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {erro && <div role="alert" className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">{erro}</div>}

      {carregando && <Carregando linhas={4} />}
      {!carregando && !erro && notas.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <FileText size={36} className="mx-auto mb-2" />
          <p className="text-sm">{busca ? 'Nenhuma nota com esse número.' : 'Nenhuma nota fiscal lançada ainda.'}</p>
        </div>
      )}

      <ul className="space-y-3">
        {!carregando && notas.map((n) => (
          <li key={n.id}>
            <button
              onClick={() => setVisualizando(n)}
              className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 active:bg-gray-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-800">Nota {n.numero} / {n.serie}</p>
                  <p className="text-sm text-gray-600 truncate">{n.fornecedor_nome || '—'}</p>
                </div>
                <p className="font-semibold text-gray-800 shrink-0">{formatarMoeda(n.valor_total)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-gray-500">
                <span>{formatarData(n.data_emissao)}</span>
                <span className="bg-gray-100 text-gray-700 rounded-full px-2 py-0.5">{labelTipoNota(n.tipo)}</span>
                {n.maquinas.length > 0 && <span>{n.maquinas.join(', ')}</span>}
              </div>
            </button>
          </li>
        ))}
      </ul>

      {lancando && (
        <NotaFiscalRapidaModal
          maquinas={maquinas}
          fornecedores={fornecedores}
          onClose={() => setLancando(false)}
          onSave={lancar}
          onFornecedorCriado={(f) => setFornecedores((atual) => (atual.some((x) => x.id === f.id) ? atual : [...atual, f]))}
        />
      )}

      <NotaFiscalDetalheModal nota={visualizando} centrosDespesa={[]} onClose={() => setVisualizando(null)} />
    </div>
  )
}
