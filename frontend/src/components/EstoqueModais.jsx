import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import Modal from './Modal'
import { listarMaquinas } from '../services/maquinas'
import { extrairMensagemErro } from '../services/notasFiscais'
import { UNIDADES, formatarQtd, listarMovimentos } from '../services/estoque'

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30'

function Casca({ titulo, onClose, children, largo = false, somenteLeitura = false }) {
  return (
    <Modal onClose={onClose} fecharAoClicarFora={somenteLeitura}>
      <div className={`bg-white rounded-xl shadow-xl w-full ${largo ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">{titulo}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-600" aria-label="Fechar" title="Fechar"><X size={20} /></button>
        </div>
        {children}
      </div>
    </Modal>
  )
}

function Rodape({ onClose, salvando, textoSalvar, erro }) {
  return (
    <>
      {erro && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
        <button type="submit" disabled={salvando} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-60">
          {salvando ? 'Salvando...' : textoSalvar}
        </button>
      </div>
    </>
  )
}

// Envolve o envio: mostra o erro da API dentro do modal e só fecha se deu certo
function useEnvio(acao) {
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)
  async function enviar(e) {
    e.preventDefault()
    setErro(null)
    setSalvando(true)
    try {
      await acao()
    } catch (err) {
      setErro(extrairMensagemErro(err, 'Não foi possível salvar.'))
    } finally {
      setSalvando(false)
    }
  }
  return { salvando, erro, enviar }
}

export function ProdutoModal({ produto, onClose, onSave }) {
  const [nome, setNome] = useState(produto?.nome || '')
  const [unidade, setUnidade] = useState(produto?.unidade_medida || 'un')
  const [minimo, setMinimo] = useState(produto?.estoque_minimo ?? '')
  const [ativo, setAtivo] = useState(produto?.ativo ?? true)
  const { salvando, erro, enviar } = useEnvio(() =>
    onSave({ nome, unidade_medida: unidade, estoque_minimo: minimo === '' ? null : Number(minimo), ...(produto ? { ativo } : {}) }),
  )
  return (
    <Casca titulo={produto ? 'Editar produto' : 'Novo produto'} onClose={onClose}>
      <form onSubmit={enviar} className="p-6 space-y-4">
        <label className="block"><span className="block text-sm text-gray-600 mb-1">Nome *</span>
          <input required minLength={2} maxLength={200} value={nome} onChange={(e) => setNome(e.target.value)} className={INPUT} placeholder="Ex: Farol Bobcat S650" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="block text-sm text-gray-600 mb-1">Unidade</span>
            <select value={unidade} onChange={(e) => setUnidade(e.target.value)} className={INPUT}>
              {UNIDADES.map((u) => <option key={u}>{u}</option>)}
            </select></label>
          <label className="block"><span className="block text-sm text-gray-600 mb-1">Estoque mínimo</span>
            <input type="number" min="0" step="any" value={minimo} onChange={(e) => setMinimo(e.target.value)} className={INPUT} placeholder="Sem alerta" /></label>
        </div>
        {produto && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Produto ativo (aparece nas retiradas)
          </label>
        )}
        {!produto && <p className="text-xs text-gray-500">O saldo começa em zero. Ele sobe quando você dá entrada da mercadoria de uma nota (ou por ajuste de saldo).</p>}
        <Rodape onClose={onClose} salvando={salvando} textoSalvar="Salvar" erro={erro} />
      </form>
    </Casca>
  )
}

export function RetiradaModal({ produto, onClose, onSave }) {
  const [quantidade, setQuantidade] = useState('')
  const [maquinaId, setMaquinaId] = useState('')
  const [observacao, setObservacao] = useState('')
  const [maquinas, setMaquinas] = useState([])
  useEffect(() => { listarMaquinas({ apenas_disponiveis: true }).then(setMaquinas).catch(() => {}) }, [])
  const { salvando, erro, enviar } = useEnvio(() =>
    onSave({ quantidade: Number(quantidade), maquina_id: maquinaId ? Number(maquinaId) : null, observacao: observacao || null }),
  )
  return (
    <Casca titulo={`Retirar: ${produto.nome}`} onClose={onClose}>
      <form onSubmit={enviar} className="p-6 space-y-4">
        <p className="text-sm text-gray-600">Em estoque: <strong>{formatarQtd(produto.estoque_atual)} {produto.unidade_medida}</strong></p>
        <label className="block"><span className="block text-sm text-gray-600 mb-1">Quantidade *</span>
          <input required autoFocus type="number" min="0.001" step="any" max={produto.estoque_atual} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} className={INPUT} /></label>
        <label className="block"><span className="block text-sm text-gray-600 mb-1">Máquina em que será usado</span>
          <select value={maquinaId} onChange={(e) => setMaquinaId(e.target.value)} className={INPUT}>
            <option value="">— não informar —</option>
            {maquinas.map((m) => <option key={m.id} value={m.id}>{m.codigo}{m.modelo ? ` · ${m.modelo}` : ''}</option>)}
          </select></label>
        <label className="block"><span className="block text-sm text-gray-600 mb-1">Observação</span>
          <input maxLength={500} value={observacao} onChange={(e) => setObservacao(e.target.value)} className={INPUT} placeholder="Ex: troca do farol esquerdo" /></label>
        <Rodape onClose={onClose} salvando={salvando} textoSalvar="Confirmar retirada" erro={erro} />
      </form>
    </Casca>
  )
}

export function AjusteModal({ produto, onClose, onSave }) {
  const [novoSaldo, setNovoSaldo] = useState(String(produto.estoque_atual))
  const [motivo, setMotivo] = useState('')
  const diferenca = Number(novoSaldo) - Number(produto.estoque_atual)
  const { salvando, erro, enviar } = useEnvio(() => onSave({ quantidade: diferenca, motivo }))
  return (
    <Casca titulo={`Ajustar saldo: ${produto.nome}`} onClose={onClose}>
      <form onSubmit={enviar} className="p-6 space-y-4">
        <p className="text-sm text-gray-600">Use depois de uma contagem física. Fica registrado no histórico com o motivo.</p>
        <label className="block"><span className="block text-sm text-gray-600 mb-1">Saldo correto ({produto.unidade_medida}) *</span>
          <input required type="number" min="0" step="any" value={novoSaldo} onChange={(e) => setNovoSaldo(e.target.value)} className={INPUT} /></label>
        <p className="text-sm text-gray-500">Diferença: <strong className={diferenca < 0 ? 'text-red-600' : 'text-green-700'}>{diferenca > 0 ? '+' : ''}{formatarQtd(diferenca || 0)}</strong></p>
        <label className="block"><span className="block text-sm text-gray-600 mb-1">Motivo *</span>
          <input required minLength={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={INPUT} placeholder="Ex: contagem de inventário" /></label>
        <Rodape onClose={onClose} salvando={salvando || diferenca === 0} textoSalvar="Ajustar saldo" erro={erro} />
      </form>
    </Casca>
  )
}

const ROTULO = { entrada: 'Entrada', retirada: 'Retirada', ajuste: 'Ajuste' }
const COR = { entrada: 'bg-green-50 text-green-700', retirada: 'bg-amber-50 text-amber-700', ajuste: 'bg-gray-100 text-gray-700' }

export function MovimentosModal({ produto, onClose }) {
  const [movs, setMovs] = useState(null)
  const [erro, setErro] = useState(null)
  useEffect(() => { listarMovimentos(produto.id).then(setMovs).catch(() => setErro('Não foi possível carregar o histórico.')) }, [produto.id])
  return (
    <Casca titulo={`Histórico: ${produto.nome}`} onClose={onClose} largo somenteLeitura>
      <div className="p-6">
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        {!movs && !erro && <p className="text-sm text-gray-500">Carregando...</p>}
        {movs && movs.length === 0 && <p className="text-sm text-gray-500">Ainda não há movimentações.</p>}
        {movs && movs.length > 0 && (
          <div className="border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Quando</th><th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium text-right">Qtd.</th><th className="px-3 py-2 font-medium">Detalhe</th><th className="px-3 py-2 font-medium">Quem</th>
              </tr></thead>
              <tbody>
                {movs.map((m) => (
                  <tr key={m.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-3 py-2"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${COR[m.tipo]}`}>{ROTULO[m.tipo] || m.tipo}</span></td>
                    <td className="px-3 py-2 text-right font-medium">{m.tipo === 'retirada' ? '−' : m.quantidade > 0 ? '+' : ''}{formatarQtd(m.quantidade)}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {[m.nota_numero && `Nota ${m.nota_numero}`, m.maquina_codigo && `Máquina ${m.maquina_codigo}`, m.observacao].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{m.usuario_nome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Casca>
  )
}
