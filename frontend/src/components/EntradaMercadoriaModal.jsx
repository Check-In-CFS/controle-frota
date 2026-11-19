import { useEffect, useState } from 'react'
import { X, PackagePlus } from 'lucide-react'
import Modal from './Modal'

import { listarProdutos, darEntradaMercadoria } from '../services/estoque'
import { formatarQtd } from '../utils/formatar'
import { extrairMensagemErro } from '../services/api'

const INPUT = 'border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30'
const NOVO = 'novo'

const pendente = (item) => Math.max(0, Number(item.quantidade) - Number(item.quantidade_recebida || 0))
const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ')

// Marca a chegada da mercadoria de uma nota: cada item vira saldo de um produto do estoque
export default function EntradaMercadoriaModal({ nota, onClose, onConcluido }) {
  const itens = (nota.itens || []).filter((i) => pendente(i) > 0)
  const [produtos, setProdutos] = useState(null)
  const [linhas, setLinhas] = useState({})
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    listarProdutos({ incluir_inativos: false }).then((lista) => {
      setProdutos(lista)
      // sugestão: produto já ligado ao item, senão o de mesmo nome, senão criar novo
      const inicial = {}
      for (const i of (nota.itens || []).filter((x) => pendente(x) > 0)) {
        const igual = lista.find((p) => norm(p.nome) === norm(i.nome))
        inicial[i.id] = { marcado: true, quantidade: String(pendente(i)), produto: i.produto_id ? String(i.produto_id) : igual ? String(igual.id) : NOVO }
      }
      setLinhas(inicial)
    }).catch(() => setErro('Não foi possível carregar o estoque.'))
  }, [nota])

  const mudar = (id, campo, valor) => setLinhas((l) => ({ ...l, [id]: { ...l[id], [campo]: valor } }))
  const marcados = itens.filter((i) => linhas[i.id]?.marcado)

  async function enviar(e) {
    e.preventDefault()
    setErro(null)
    setSalvando(true)
    try {
      const atualizada = await darEntradaMercadoria(nota.id, {
        observacao: observacao || null,
        itens: marcados.map((i) => {
          const l = linhas[i.id]
          return { item_id: i.id, quantidade: Number(l.quantidade), ...(l.produto === NOVO ? { novo_produto: true } : { produto_id: Number(l.produto) }) }
        }),
      })
      onConcluido(atualizada)
    } catch (err) {
      setErro(extrairMensagemErro(err, 'Não foi possível dar entrada da mercadoria.'))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">Entrada de mercadoria · Nota {nota.numero}/{nota.serie}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-600" aria-label="Fechar" title="Fechar"><X size={20} /></button>
        </div>
        <form onSubmit={enviar} className="p-6 space-y-4">
          <p className="text-sm text-gray-600">Marque o que chegou. Cada item vai para o estoque e fica aguardando a retirada. Pode dar entrada só de parte.</p>

          {itens.length === 0 && <p className="text-sm text-gray-500">Todos os itens desta nota já deram entrada.</p>}
          {itens.length > 0 && !produtos && !erro && <p className="text-sm text-gray-500">Carregando...</p>}

          {produtos && itens.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 text-left text-gray-500">
                  <th className="px-3 py-2 w-8"></th><th className="px-3 py-2 font-medium">Item da nota</th>
                  <th className="px-3 py-2 font-medium">Qtd. recebida</th><th className="px-3 py-2 font-medium">Produto no estoque</th>
                </tr></thead>
                <tbody>
                  {itens.map((i) => {
                    const l = linhas[i.id]
                    if (!l) return null
                    return (
                      <tr key={i.id} className="border-t border-gray-100 align-middle">
                        <td className="px-3 py-2"><input type="checkbox" checked={l.marcado} onChange={(e) => mudar(i.id, 'marcado', e.target.checked)} aria-label={`Receber ${i.nome}`} /></td>
                        <td className="px-3 py-2">{i.nome}<span className="block text-xs text-gray-500">falta {formatarQtd(pendente(i))} de {formatarQtd(i.quantidade)}</span></td>
                        <td className="px-3 py-2"><input type="number" min="0.001" max={pendente(i)} step="any" required={l.marcado} disabled={!l.marcado} value={l.quantidade} onChange={(e) => mudar(i.id, 'quantidade', e.target.value)} className={`${INPUT} w-24`} /></td>
                        <td className="px-3 py-2">
                          <select disabled={!l.marcado} value={l.produto} onChange={(e) => mudar(i.id, 'produto', e.target.value)} className={`${INPUT} w-full min-w-[200px]`}>
                            <option value={NOVO}>➕ Criar produto “{i.nome}”</option>
                            {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome} ({formatarQtd(p.estoque_atual)} {p.unidade_medida})</option>)}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <label className="block"><span className="block text-sm text-gray-600 mb-1">Observação</span>
            <input maxLength={500} value={observacao} onChange={(e) => setObservacao(e.target.value)} className={`${INPUT} w-full`} placeholder="Ex: recebido pelo João, caixa sem avaria" /></label>

          {erro && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button type="submit" disabled={salvando || marcados.length === 0} className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-60">
              <PackagePlus size={16} /> {salvando ? 'Registrando...' : `Dar entrada (${marcados.length})`}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
