import { useEffect, useState, useCallback } from 'react'
import { Search, Plus, Pencil, PackageMinus, History, SlidersHorizontal, AlertTriangle } from 'lucide-react'
import { useAuth } from '../services/auth'
import { toast } from '../services/toast'
import Carregando from '../components/Carregando'
import { ProdutoModal, RetiradaModal, AjusteModal, MovimentosModal } from '../components/EstoqueModais'
import { listarProdutos, criarProduto, atualizarProduto, retirarProduto, ajustarProduto, formatarQtd } from '../services/estoque'

export default function Estoque() {
  const { isAdmin, isDiretor } = useAuth()
  const [produtos, setProdutos] = useState([])
  const [busca, setBusca] = useState('')
  const [soBaixos, setSoBaixos] = useState(false)
  const [inativos, setInativos] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [modal, setModal] = useState(null) // { tipo, produto }

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      setProdutos(await listarProdutos({ busca: busca || undefined, abaixo_minimo: soBaixos || undefined, incluir_inativos: inativos || undefined }))
    } catch {
      setErro('Não foi possível carregar o estoque.')
    } finally {
      setCarregando(false)
    }
  }, [busca, soBaixos, inativos])

  useEffect(() => {
    const t = setTimeout(carregar, 300)
    return () => clearTimeout(t)
  }, [carregar])

  const fechar = () => setModal(null)
  // cada ação chama a API; se falhar, o erro volta ao modal (que o mostra) e ele continua aberto
  async function salvarProduto(payload) {
    if (modal.produto) await atualizarProduto(modal.produto.id, payload)
    else await criarProduto(payload)
    fechar(); carregar()
  }
  async function retirar(payload) {
    await retirarProduto(modal.produto.id, payload)
    toast.sucesso('Retirada registrada.')
    fechar(); carregar()
  }
  async function ajustar(payload) {
    await ajustarProduto(modal.produto.id, payload)
    fechar(); carregar()
  }

  const abaixo = produtos.filter((p) => p.abaixo_minimo).length

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Estoque</h1>
          <p className="text-sm text-gray-500">Mercadoria que deu entrada pelas notas e aguarda retirada.</p>
        </div>
        {isAdmin && (
          <button onClick={() => setModal({ tipo: 'produto', produto: null })} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-dark">
            <Plus size={16} /> Novo produto
          </button>
        )}
      </div>

      {abaixo > 0 && !soBaixos && (
        <button onClick={() => setSoBaixos(true)} className="w-full flex items-center gap-2 bg-amber-50 text-amber-800 text-sm px-4 py-3 rounded-lg mb-4 text-left hover:bg-amber-100">
          <AlertTriangle size={16} /> {abaixo} produto(s) no estoque mínimo ou abaixo. Clique para ver só esses.
        </button>
      )}

      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar produto (ex: farol)" aria-label="Pesquisar produto"
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={soBaixos} onChange={(e) => setSoBaixos(e.target.checked)} /> Só estoque baixo</label>
        {isAdmin && <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} /> Mostrar inativos</label>}
      </div>

      {erro && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">{erro}</div>}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-gray-500 border-b border-gray-200">
              <th className="px-4 py-3 font-medium">Produto</th>
              <th className="px-4 py-3 font-medium text-right">Em estoque</th>
              <th className="px-4 py-3 font-medium text-right">Mínimo</th>
              <th className="px-4 py-3 font-medium">Situação</th>
              <th className="px-4 py-3 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando && <tr><td colSpan={5}><Carregando linhas={4} /></td></tr>}
            {!carregando && produtos.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-gray-500">Nenhum produto no estoque. A mercadoria entra pela nota fiscal (botão "Dar entrada de mercadoria").</td></tr>
            )}
            {!carregando && produtos.map((p) => (
              <tr key={p.id} className={`border-b border-gray-100 last:border-0 hover:bg-gray-50/50 ${p.ativo ? '' : 'opacity-60'}`}>
                <td className="px-4 py-3 font-medium text-gray-700">{p.nome}{!p.ativo && <span className="ml-2 text-xs text-gray-500">(inativo)</span>}</td>
                <td className="px-4 py-3 text-right font-semibold">{formatarQtd(p.estoque_atual)} <span className="font-normal text-gray-500">{p.unidade_medida}</span></td>
                <td className="px-4 py-3 text-right text-gray-500">{p.estoque_minimo != null ? formatarQtd(p.estoque_minimo) : '—'}</td>
                <td className="px-4 py-3">
                  {p.estoque_atual <= 0
                    ? <span className="text-xs font-medium bg-red-50 text-red-700 px-2 py-0.5 rounded-full">Sem estoque</span>
                    : p.abaixo_minimo
                      ? <span className="text-xs font-medium bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">Estoque baixo</span>
                      : <span className="text-xs font-medium bg-green-50 text-green-700 px-2 py-0.5 rounded-full">Disponível</span>}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {!isDiretor && p.ativo && p.estoque_atual > 0 && (
                    <button onClick={() => setModal({ tipo: 'retirada', produto: p })} className="inline-flex items-center gap-1 text-primary hover:bg-indigo-50 px-2 py-1 rounded-lg mr-1" title="Retirar do estoque">
                      <PackageMinus size={16} /> <span className="text-xs">Retirar</span>
                    </button>
                  )}
                  <button onClick={() => setModal({ tipo: 'historico', produto: p })} className="text-gray-500 hover:text-primary p-1.5" aria-label="Histórico" title="Histórico"><History size={16} /></button>
                  {isAdmin && <>
                    <button onClick={() => setModal({ tipo: 'ajuste', produto: p })} className="text-gray-500 hover:text-primary p-1.5" aria-label="Ajustar saldo" title="Ajustar saldo"><SlidersHorizontal size={16} /></button>
                    <button onClick={() => setModal({ tipo: 'produto', produto: p })} className="text-gray-500 hover:text-primary p-1.5" aria-label="Editar" title="Editar"><Pencil size={16} /></button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal?.tipo === 'produto' && <ProdutoModal produto={modal.produto} onClose={fechar} onSave={salvarProduto} />}
      {modal?.tipo === 'retirada' && <RetiradaModal produto={modal.produto} onClose={fechar} onSave={retirar} />}
      {modal?.tipo === 'ajuste' && <AjusteModal produto={modal.produto} onClose={fechar} onSave={ajustar} />}
      {modal?.tipo === 'historico' && <MovimentosModal produto={modal.produto} onClose={fechar} />}
    </div>
  )
}
