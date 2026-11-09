import { useState, useRef } from 'react'
import { X, Upload, Plus, Trash2, ChevronLeft, Check, FileCheck2, Camera } from 'lucide-react'
import { TIPOS_NOTA, importarXmlNotaFiscal, lerFotoNotaFiscal, extrairMensagemErro } from '../services/notasFiscais'
import { api } from '../services/api'
import FornecedorModal from './FornecedorModal'
import Modal from './Modal'

const HOJE = new Date().toISOString().slice(0, 10)
const PASSOS = ['Nota', 'Máquina', 'Valor']

const VAZIO = {
  numero: '',
  serie: '1',
  fornecedor_id: '',
  data_emissao: HOJE,
  tipo: 'peca',
  valor_total: '',
  observacoes: '',
  arquivo_url: '',
  maquina_ids: [],
  itens: [],
}

function moeda(valor) {
  return (Number(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * Lançamento de nota fiscal pensado para o celular do mecânico: 3 passos curtos
 * (Nota → Máquina → Valor), botões grandes, e atalho para importar o XML da NF-e
 * que já preenche quase tudo.
 */
export default function NotaFiscalRapidaModal({ maquinas, fornecedores, onClose, onSave, onFornecedorCriado }) {
  const [passo, setPasso] = useState(0)
  const [form, setForm] = useState(VAZIO)
  const [erro, setErro] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [listaFornecedores, setListaFornecedores] = useState(fornecedores)
  const [novoFornecedorAberto, setNovoFornecedorAberto] = useState(false)
  const [importando, setImportando] = useState(false)
  const [xmlImportado, setXmlImportado] = useState(null)
  const [filtroMaquina, setFiltroMaquina] = useState('')
  const [lendoFoto, setLendoFoto] = useState(false)
  const [fotoInfo, setFotoInfo] = useState(null)
  const inputXmlRef = useRef(null)
  const inputFotoRef = useRef(null)

  const temItens = form.itens.length > 0
  const totalItens = form.itens.reduce((s, i) => s + (Number(i.quantidade) || 0) * (Number(i.valor_unitario) || 0), 0)
  const valorFinal = temItens ? totalItens : Number(form.valor_total) || 0

  function atualizar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  function alternarMaquina(id) {
    setForm((f) => ({
      ...f,
      maquina_ids: f.maquina_ids.includes(id) ? f.maquina_ids.filter((m) => m !== id) : [...f.maquina_ids, id],
    }))
  }

  function atualizarItem(i, campo, valor) {
    setForm((f) => {
      const itens = [...f.itens]
      itens[i] = { ...itens[i], [campo]: valor }
      return { ...f, itens }
    })
  }

  async function salvarNovoFornecedor(payload) {
    const { data } = await api.post('/fornecedores', payload)
    setListaFornecedores((atual) => [...atual, data])
    atualizar('fornecedor_id', data.id)
    setNovoFornecedorAberto(false)
    onFornecedorCriado?.(data)
  }

  async function handleArquivoXml(e) {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    setErro(null)
    setImportando(true)
    try {
      const d = await importarXmlNotaFiscal(arquivo)
      setForm((f) => ({
        ...f,
        numero: d.numero,
        serie: d.serie,
        data_emissao: d.data_emissao,
        valor_total: d.valor_total,
        fornecedor_id: d.fornecedor_id,
        itens: d.itens || [],
      }))
      if (!listaFornecedores.some((f) => f.id === d.fornecedor_id)) {
        const novo = { id: d.fornecedor_id, nome: d.fornecedor_nome }
        setListaFornecedores((atual) => [...atual, novo])
        onFornecedorCriado?.(novo)
      }
      setXmlImportado({ fornecedor: d.fornecedor_nome, itens: d.itens?.length || 0 })
    } catch (err) {
      setErro(extrairMensagemErro(err, 'Não foi possível ler o XML. Verifique se é uma NF-e válida.'))
    } finally {
      setImportando(false)
      if (inputXmlRef.current) inputXmlRef.current.value = ''
    }
  }

  async function handleFoto(e) {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    setErro(null)
    setLendoFoto(true)
    try {
      const r = await lerFotoNotaFiscal(arquivo)
      const d = r.dados
      setForm((f) => ({
        ...f,
        arquivo_url: r.arquivo_url,
        ...(d?.numero ? { numero: d.numero } : {}),
        ...(d?.serie ? { serie: d.serie } : {}),
        ...(d?.data_emissao ? { data_emissao: d.data_emissao } : {}),
        ...(d?.valor_total != null ? { valor_total: d.valor_total } : {}),
        ...(d?.tipo ? { tipo: d.tipo } : {}),
        ...(d?.fornecedor_id ? { fornecedor_id: d.fornecedor_id } : {}),
        ...(d?.itens?.length ? { itens: d.itens } : {}),
      }))
      setFotoInfo({
        aviso: r.aviso,
        lido: !!d,
        fornecedorNaoCadastrado: d && !d.fornecedor_id ? (d.fornecedor_nome || d.fornecedor_cnpj || null) : null,
      })
    } catch (err) {
      setErro(extrairMensagemErro(err, 'Não foi possível enviar a foto. Tente de novo.'))
    } finally {
      setLendoFoto(false)
      if (inputFotoRef.current) inputFotoRef.current.value = ''
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setErro(null)

    // passos 1 e 2: valida o que o usuário preencheu e avança
    if (passo === 0) {
      if (!/^\d+$/.test(form.numero)) return setErro('O número da nota deve ter apenas números.')
      if (form.data_emissao > HOJE) return setErro('A data de emissão não pode ser no futuro.')
      return setPasso(1)
    }
    if (passo === 1) return setPasso(2)

    // passo 3: envia
    if (form.itens.some((i) => !i.nome?.trim())) return setErro('Dê um nome para todos os itens.')
    if (valorFinal <= 0) return setErro('Informe o valor da nota.')

    setSalvando(true)
    try {
      await onSave({
        ...form,
        fornecedor_id: Number(form.fornecedor_id),
        centro_despesa_id: null,
        valor_total: valorFinal,
        itens: form.itens.map((i) => ({
          nome: i.nome,
          quantidade: Number(i.quantidade),
          valor_unitario: Number(i.valor_unitario),
        })),
      })
    } catch (err) {
      setErro(extrairMensagemErro(err, 'Não foi possível lançar a nota fiscal.'))
    } finally {
      setSalvando(false)
    }
  }

  const maquinasFiltradas = maquinas.filter((m) =>
    `${m.codigo} ${m.marca || ''} ${m.modelo || ''}`.toLowerCase().includes(filtroMaquina.trim().toLowerCase())
  )
  const fornecedorSelecionado = listaFornecedores.find((f) => String(f.id) === String(form.fornecedor_id))
  const codigosSelecionados = maquinas.filter((m) => form.maquina_ids.includes(m.id)).map((m) => m.codigo)

  return (
    <Modal onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[95vh] flex flex-col">
        <div className="px-5 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">Lançar nota fiscal</h2>
            <button onClick={onClose} aria-label="Fechar" title="Fechar" className="text-gray-500 hover:text-gray-600">
              <X size={22} />
            </button>
          </div>
          <ol className="flex items-center gap-2 mt-3" aria-label="Passos">
            {PASSOS.map((nome, i) => (
              <li key={nome} className="flex-1" aria-current={i === passo ? 'step' : undefined}>
                <div className={`h-1.5 rounded-full ${i <= passo ? 'bg-primary' : 'bg-gray-200'}`} />
                <span className={`block text-xs mt-1 ${i === passo ? 'text-primary font-medium' : 'text-gray-500'}`}>
                  {i + 1}. {nome}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {erro && <div role="alert" className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{erro}</div>}

            {passo === 0 && (
              <>
                <div className="rounded-xl border border-dashed border-primary/40 bg-indigo-50/50 p-3 space-y-1">
                  <input ref={inputFotoRef} type="file" accept="image/*" capture="environment" onChange={handleFoto} className="hidden" id="foto-nota" />
                  <label
                    htmlFor="foto-nota"
                    className="flex items-center justify-center gap-2 text-sm font-medium text-primary cursor-pointer py-2"
                  >
                    {form.arquivo_url ? <Check size={18} /> : <Camera size={18} />}
                    {lendoFoto ? 'Enviando e lendo a foto...' : form.arquivo_url ? 'Foto anexada — toque para trocar' : 'Tirar foto da nota (preenche sozinho)'}
                  </label>
                  {fotoInfo && (
                    <p className="text-xs text-gray-600 text-center">
                      {fotoInfo.aviso || 'Foto lida. Os campos que não deu para ler ficam em branco — confira tudo antes de continuar.'}
                      {fotoInfo.fornecedorNaoCadastrado && (
                        <> Fornecedor (CNPJ) lido: <strong>{fotoInfo.fornecedorNaoCadastrado}</strong> (não está cadastrado — escolha outro ou cadastre).</>
                      )}
                    </p>
                  )}
                  <input ref={inputXmlRef} type="file" accept=".xml,text/xml" onChange={handleArquivoXml} className="hidden" id="xml-nota" />
                  <label
                    htmlFor="xml-nota"
                    className="flex items-center justify-center gap-2 text-sm font-medium text-primary cursor-pointer py-2 border-t border-primary/20"
                  >
                    {xmlImportado ? <FileCheck2 size={18} /> : <Upload size={18} />}
                    {importando ? 'Lendo o XML...' : xmlImportado ? 'XML importado — toque para trocar' : 'Tenho o XML da nota (preenche sozinho)'}
                  </label>
                  {xmlImportado && (
                    <p className="text-xs text-gray-600 text-center">
                      {xmlImportado.fornecedor} · {xmlImportado.itens} item(ns). Confira os dados abaixo.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <label className="col-span-2 block">
                    <span className="block text-sm text-gray-600 mb-1">Número da nota *</span>
                    <input
                      required
                      inputMode="numeric"
                      maxLength={10}
                      value={form.numero}
                      onChange={(e) => atualizar('numero', e.target.value.replace(/\D/g, ''))}
                      className="input"
                      placeholder="Ex: 000123"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-sm text-gray-600 mb-1">Série</span>
                    <input value={form.serie} onChange={(e) => atualizar('serie', e.target.value)} className="input" />
                  </label>
                </div>

                <label className="block">
                  <span className="block text-sm text-gray-600 mb-1">Data de emissão *</span>
                  <input required type="date" max={HOJE} value={form.data_emissao} onChange={(e) => atualizar('data_emissao', e.target.value)} className="input" />
                </label>

                <div>
                  <label className="block">
                    <span className="block text-sm text-gray-600 mb-1">Fornecedor *</span>
                    <select required value={form.fornecedor_id} onChange={(e) => atualizar('fornecedor_id', e.target.value)} className="input">
                      <option value="">Selecione...</option>
                      {listaFornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                  </label>
                  <button type="button" onClick={() => setNovoFornecedorAberto(true)} className="mt-2 text-sm text-primary font-medium flex items-center gap-1">
                    <Plus size={16} /> Fornecedor não está na lista
                  </button>
                </div>
              </>
            )}

            {passo === 1 && (
              <>
                <fieldset>
                  <legend className="text-sm text-gray-600 mb-2">O que foi comprado? *</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {TIPOS_NOTA.map((t) => (
                      <button
                        type="button"
                        key={t.value}
                        aria-pressed={form.tipo === t.value}
                        onClick={() => atualizar('tipo', t.value)}
                        className={`py-3 rounded-lg text-sm font-medium border ${
                          form.tipo === t.value ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-200'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <p className="text-sm text-gray-600 mb-2">Para qual máquina? <span className="text-gray-500">(pode marcar mais de uma)</span></p>
                  <input
                    value={filtroMaquina}
                    onChange={(e) => setFiltroMaquina(e.target.value)}
                    placeholder="Buscar máquina"
                    aria-label="Buscar máquina"
                    className="input mb-2"
                  />
                  <ul className="space-y-2 max-h-64 overflow-y-auto">
                    {maquinasFiltradas.length === 0 && <li className="text-sm text-gray-500 py-2">Nenhuma máquina encontrada.</li>}
                    {maquinasFiltradas.map((m) => {
                      const marcada = form.maquina_ids.includes(m.id)
                      return (
                        <li key={m.id}>
                          <button
                            type="button"
                            aria-pressed={marcada}
                            onClick={() => alternarMaquina(m.id)}
                            className={`w-full flex items-center justify-between text-left px-4 py-3 rounded-lg border text-sm ${
                              marcada ? 'border-primary bg-indigo-50 text-primary' : 'border-gray-200 text-gray-700'
                            }`}
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
                </div>
              </>
            )}

            {passo === 2 && (
              <>
                {!temItens ? (
                  <label className="block">
                    <span className="block text-sm text-gray-600 mb-1">Valor total da nota (R$) *</span>
                    <input
                      required
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0.01"
                      value={form.valor_total}
                      onChange={(e) => atualizar('valor_total', e.target.value)}
                      className="input text-lg"
                      placeholder="0,00"
                    />
                  </label>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600">Itens da nota <span className="text-gray-500">(o total é a soma deles)</span></p>
                    {form.itens.map((item, i) => (
                      <div key={i} className="rounded-lg border border-gray-200 p-3 space-y-2">
                        <div className="flex gap-2">
                          <input required aria-label="Nome do item" placeholder="Nome do item" value={item.nome} onChange={(e) => atualizarItem(i, 'nome', e.target.value)} className="input" />
                          <button type="button" aria-label="Excluir" title="Remover item" onClick={() => setForm((f) => ({ ...f, itens: f.itens.filter((_, k) => k !== i) }))} className="text-gray-500 hover:text-red-600 shrink-0">
                            <Trash2 size={18} />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <span className="text-xs text-gray-500">Quantidade</span>
                            <input required type="number" inputMode="decimal" step="any" min="0.001" value={item.quantidade} onChange={(e) => atualizarItem(i, 'quantidade', e.target.value)} className="input" />
                          </label>
                          <label className="block">
                            <span className="text-xs text-gray-500">Valor unitário (R$)</span>
                            <input required type="number" inputMode="decimal" step="0.01" min="0" value={item.valor_unitario} onChange={(e) => atualizarItem(i, 'valor_unitario', e.target.value)} className="input" />
                          </label>
                        </div>
                      </div>
                    ))}
                    <p className="text-right text-sm font-medium text-gray-700">Total: {moeda(totalItens)}</p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, itens: [...f.itens, { nome: '', quantidade: 1, valor_unitario: 0 }] }))}
                  className="text-sm text-primary font-medium flex items-center gap-1"
                >
                  <Plus size={16} /> {temItens ? 'Adicionar outro item' : 'Detalhar por itens (opcional)'}
                </button>

                <label className="block">
                  <span className="block text-sm text-gray-600 mb-1">Observações (opcional)</span>
                  <textarea rows={2} value={form.observacoes} onChange={(e) => atualizar('observacoes', e.target.value)} className="input" />
                </label>

                <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm space-y-1">
                  <p className="font-medium text-gray-700">Resumo</p>
                  <p className="text-gray-600">Nota {form.numero}/{form.serie} · {fornecedorSelecionado?.nome || '—'}</p>
                  <p className="text-gray-600">Máquinas: {codigosSelecionados.length ? codigosSelecionados.join(', ') : 'nenhuma'}</p>
                  <p className="text-gray-800 font-semibold">{moeda(valorFinal)}</p>
                </div>
              </>
            )}
          </div>

          <div className="px-5 py-3 border-t border-gray-100 flex gap-3">
            {passo > 0 && (
              <button type="button" onClick={() => { setErro(null); setPasso(passo - 1) }} className="flex items-center gap-1 px-4 py-3 text-sm text-gray-600 border border-gray-200 rounded-lg">
                <ChevronLeft size={16} /> Voltar
              </button>
            )}
            <button
              type="submit"
              disabled={salvando || importando || lendoFoto}
              className="flex-1 bg-primary text-white py-3 rounded-lg text-sm font-semibold hover:bg-primary-dark disabled:opacity-60"
            >
              {passo < 2 ? 'Continuar' : salvando ? 'Lançando...' : 'Lançar nota'}
            </button>
          </div>
        </form>
      </div>

      {novoFornecedorAberto && (
        <FornecedorModal onClose={() => setNovoFornecedorAberto(false)} onSave={salvarNovoFornecedor} />
      )}
    </Modal>
  )
}
