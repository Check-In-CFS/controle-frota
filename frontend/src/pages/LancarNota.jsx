import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, Check, ChevronLeft, ImagePlus, Plus, ShieldAlert, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../services/auth'
import { api } from '../services/api'
import { listarMaquinas } from '../services/maquinas'
import {
  TIPOS_NOTA, MOTIVOS_NOTA, montarObservacaoComMotivo,
  lerFotoNotaFiscal, criarNotaFiscal, extrairMensagemErro,
} from '../services/notasFiscais'
import FornecedorModal from '../components/FornecedorModal'
import CelularCabecalho from '../components/CelularCabecalho'
import { useErrosDeCampo } from '../hooks/useErrosDeCampo'

const HOJE = new Date().toISOString().slice(0, 10)

/**
 * Única tela do sistema no celular: lançar nota fiscal.
 * Passo 1 -> foto da nota + máquina + motivo.  Passo 2 -> conferir os dados lidos da foto e lançar.
 */
export default function LancarNota() {
  const { isDiretor } = useAuth()
  const raizRef = useRef(null)
  useErrosDeCampo(raizRef)

  const [passo, setPasso] = useState(0)
  const [maquinas, setMaquinas] = useState([])
  const [fornecedores, setFornecedores] = useState([])
  const [novoFornecedor, setNovoFornecedor] = useState(false)
  const [filtroMaquina, setFiltroMaquina] = useState('')

  const [fotoUrl, setFotoUrl] = useState(null) // pré-visualização local
  const [arquivoUrl, setArquivoUrl] = useState('')
  const [lendo, setLendo] = useState(false)
  const [avisoFoto, setAvisoFoto] = useState(null)
  const [fornecedorLido, setFornecedorLido] = useState(null)
  const [fornecedorNovo, setFornecedorNovo] = useState(null) // fornecedor cadastrado automaticamente a partir da foto

  const [maquinaId, setMaquinaId] = useState('')
  const [motivo, setMotivo] = useState('')
  const [detalhe, setDetalhe] = useState('')

  const [dados, setDados] = useState({ numero: '', serie: '1', data_emissao: HOJE, fornecedor_id: '', tipo: 'peca', valor_total: '' })
  const [itens, setItens] = useState([])

  const [erro, setErro] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [lancada, setLancada] = useState(null)

  useEffect(() => {
    listarMaquinas({ apenas_disponiveis: true }).then(setMaquinas).catch(() => {})
    api.get('/fornecedores').then((r) => setFornecedores(r.data)).catch(() => {})
  }, [])

  useEffect(() => () => { if (fotoUrl) URL.revokeObjectURL(fotoUrl) }, [fotoUrl])

  function atualizar(campo, valor) {
    setDados((d) => ({ ...d, [campo]: valor }))
  }

  async function handleFoto(e) {
    const arquivo = e.target.files?.[0]
    e.target.value = '' // permite escolher a mesma foto de novo
    if (!arquivo) return
    setErro(null)
    setLendo(true)
    setFotoUrl(URL.createObjectURL(arquivo))
    try {
      const r = await lerFotoNotaFiscal(arquivo)
      const d = r.dados
      setArquivoUrl(r.arquivo_url)
      setAvisoFoto(r.aviso)
      setDados((atual) => ({
        ...atual,
        ...(d?.numero ? { numero: d.numero } : {}),
        ...(d?.serie ? { serie: d.serie } : {}),
        ...(d?.data_emissao ? { data_emissao: d.data_emissao } : {}),
        ...(d?.valor_total != null ? { valor_total: d.valor_total } : {}),
        ...(d?.tipo ? { tipo: d.tipo } : {}),
        ...(d?.fornecedor_id ? { fornecedor_id: d.fornecedor_id } : {}),
      }))
      if (d?.itens?.length) setItens(d.itens)
      // fornecedor encontrado ou cadastrado agora pelo servidor: garante que ele esteja na lista do campo
      if (d?.fornecedor_id) {
        setFornecedores((atual) => (atual.some((f) => f.id === d.fornecedor_id) ? atual : [...atual, { id: d.fornecedor_id, nome: d.fornecedor_nome }]))
      }
      setFornecedorNovo(d?.fornecedor_cadastrado ? { nome: d.fornecedor_nome, provisorio: d.fornecedor_nome_provisorio } : null)
      setFornecedorLido(d && !d.fornecedor_id ? (d.fornecedor_nome || d.fornecedor_cnpj || null) : null)
    } catch (err) {
      setArquivoUrl('')
      setFotoUrl(null)
      setErro(extrairMensagemErro(err, 'Não foi possível enviar a foto. Tente de novo.'))
    } finally {
      setLendo(false)
    }
  }

  async function salvarNovoFornecedor(payload) {
    const { data } = await api.post('/fornecedores', payload)
    setFornecedores((atual) => [...atual, data])
    atualizar('fornecedor_id', data.id)
    setNovoFornecedor(false)
  }

  function continuar(e) {
    e.preventDefault()
    setErro(null)
    if (!arquivoUrl) return setErro('Tire a foto da nota para continuar.')
    if (!maquinaId) return setErro('Selecione a máquina.')
    if (!motivo) return setErro('Escolha o motivo.')
    setPasso(1)
    window.scrollTo({ top: 0 })
  }

  async function lancar(e) {
    e.preventDefault()
    setErro(null)
    if (!/^\d+$/.test(dados.numero)) return setErro('O número da nota deve ter apenas números.')
    if (dados.data_emissao > HOJE) return setErro('A data de emissão não pode ser no futuro.')
    const valor = itens.length
      ? itens.reduce((s, i) => s + (Number(i.quantidade) || 0) * (Number(i.valor_unitario) || 0), 0)
      : Number(dados.valor_total)
    if (!(valor > 0)) return setErro('Informe o valor da nota.')

    setSalvando(true)
    try {
      const nota = await criarNotaFiscal({
        numero: dados.numero,
        serie: dados.serie || '1',
        fornecedor_id: Number(dados.fornecedor_id),
        data_emissao: dados.data_emissao,
        tipo: dados.tipo,
        valor_total: valor,
        centro_despesa_id: null,
        arquivo_url: arquivoUrl,
        observacoes: montarObservacaoComMotivo(motivo, detalhe),
        maquina_ids: [Number(maquinaId)],
        itens: itens.map((i) => ({ nome: i.nome, quantidade: Number(i.quantidade), valor_unitario: Number(i.valor_unitario) })),
      })
      setLancada(nota)
    } catch (err) {
      setErro(extrairMensagemErro(err, 'Não foi possível lançar a nota fiscal.'))
    } finally {
      setSalvando(false)
    }
  }

  function novaNota() {
    setPasso(0); setLancada(null); setFotoUrl(null); setArquivoUrl(''); setAvisoFoto(null); setFornecedorLido(null); setFornecedorNovo(null)
    setMaquinaId(''); setMotivo(''); setDetalhe(''); setItens([]); setErro(null)
    setDados({ numero: '', serie: '1', data_emissao: HOJE, fornecedor_id: '', tipo: 'peca', valor_total: '' })
  }

  const maquinasFiltradas = maquinas.filter((m) =>
    `${m.codigo} ${m.marca || ''} ${m.modelo || ''}`.toLowerCase().includes(filtroMaquina.trim().toLowerCase())
  )
  const maquinaEscolhida = maquinas.find((m) => String(m.id) === String(maquinaId))

  return (
    <div ref={raizRef} className="min-h-screen bg-gray-50 flex flex-col">
      <CelularCabecalho titulo="Lançar nota fiscal" />

      {isDiretor ? (
        <main className="flex-1 flex flex-col items-center justify-center text-center px-6 text-gray-600">
          <ShieldAlert size={40} className="text-gray-500 mb-3" />
          <p className="font-medium text-gray-800">Acesso somente para visualização</p>
          <p className="text-sm mt-1">No celular só é possível lançar notas, e o perfil de diretor não lança. Acesse o sistema pelo computador.</p>
        </main>
      ) : lancada ? (
        <main className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <CheckCircle2 size={56} className="text-green-600 mb-3" />
          <h1 className="text-xl font-semibold text-gray-800">Nota lançada!</h1>
          <p className="text-sm text-gray-600 mt-1">Nota {lancada.numero}/{lancada.serie} · {maquinaEscolhida?.codigo}</p>
          <button onClick={novaNota} className="mt-8 w-full max-w-xs bg-primary text-white py-4 rounded-xl text-base font-semibold">
            Lançar outra nota
          </button>
          <Link to="/celular" className="mt-3 w-full max-w-xs text-center border border-gray-200 text-gray-700 py-4 rounded-xl text-base font-medium bg-white">Voltar ao início</Link>
        </main>
      ) : (
        <main className="flex-1 px-4 py-4 pb-28">
          <ol className="flex items-center gap-2 mb-4" aria-label="Passos">
            {['Foto e máquina', 'Conferir dados'].map((nome, i) => (
              <li key={nome} className="flex-1" aria-current={i === passo ? 'step' : undefined}>
                <div className={`h-1.5 rounded-full ${i <= passo ? 'bg-primary' : 'bg-gray-200'}`} />
                <span className={`block text-xs mt-1 ${i === passo ? 'text-primary font-medium' : 'text-gray-500'}`}>{i + 1}. {nome}</span>
              </li>
            ))}
          </ol>

          {erro && <div role="alert" className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">{erro}</div>}

          {passo === 0 && (
            <form onSubmit={continuar} className="space-y-6" id="form-passo-1">
              <section>
                <h2 className="text-sm font-semibold text-gray-700 mb-2">1. Foto da nota *</h2>
                {/* dois campos de arquivo: um abre a câmera, o outro a galeria (sem "capture") */}
                <input id="foto-camera" type="file" accept="image/*" capture="environment" onChange={handleFoto} className="hidden" />
                <input id="foto-galeria" type="file" accept="image/*" onChange={handleFoto} className="hidden" />

                {fotoUrl && (
                  <img src={fotoUrl} alt="Foto da nota fiscal" className="w-full max-h-56 object-contain bg-gray-100 rounded-xl border border-gray-200 mb-3" />
                )}

                <div className="grid grid-cols-2 gap-3">
                  <label
                    htmlFor="foto-camera"
                    className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-primary bg-primary text-white py-5 text-sm font-semibold cursor-pointer active:opacity-90"
                  >
                    <Camera size={28} />
                    {fotoUrl ? 'Tirar outra' : 'Tirar foto'}
                  </label>
                  <label
                    htmlFor="foto-galeria"
                    className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-primary/40 bg-white text-primary py-5 text-sm font-semibold cursor-pointer active:bg-indigo-50"
                  >
                    <ImagePlus size={28} />
                    {fotoUrl ? 'Outra da galeria' : 'Escolher da galeria'}
                  </label>
                </div>

                <p role="status" className="text-center text-sm mt-2 text-gray-600">
                  {lendo ? 'Enviando e lendo a foto...' : arquivoUrl ? '✓ Foto anexada' : fotoUrl ? 'Não foi possível enviar. Tente de novo.' : 'Tire uma foto da nota ou escolha uma que já está no celular.'}
                </p>
                {avisoFoto && <p className="text-xs text-gray-600 mt-2">{avisoFoto}</p>}
              </section>

              <section>
                <h2 className="text-sm font-semibold text-gray-700 mb-2">2. Máquina *</h2>
                <input
                  value={filtroMaquina}
                  onChange={(e) => setFiltroMaquina(e.target.value)}
                  placeholder="Buscar máquina"
                  aria-label="Buscar máquina"
                  className="input mb-2"
                />
                <ul className="space-y-2 max-h-60 overflow-y-auto">
                  {maquinasFiltradas.length === 0 && <li className="text-sm text-gray-500 py-2">Nenhuma máquina encontrada.</li>}
                  {maquinasFiltradas.map((m) => {
                    const marcada = String(m.id) === String(maquinaId)
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          aria-pressed={marcada}
                          onClick={() => setMaquinaId(m.id)}
                          className={`w-full flex items-center justify-between text-left px-4 py-3.5 rounded-lg border text-sm ${
                            marcada ? 'border-primary bg-indigo-50 text-primary' : 'border-gray-200 bg-white text-gray-700'
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
              </section>

              <section>
                <h2 className="text-sm font-semibold text-gray-700 mb-2">3. Motivo *</h2>
                <div className="grid grid-cols-2 gap-2">
                  {MOTIVOS_NOTA.map((m) => (
                    <button
                      type="button"
                      key={m}
                      aria-pressed={motivo === m}
                      onClick={() => setMotivo(m)}
                      className={`py-3 px-2 rounded-lg text-sm font-medium border ${
                        motivo === m ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-200'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <label className="block mt-3">
                  <span className="block text-sm text-gray-600 mb-1">Detalhe (opcional)</span>
                  <textarea rows={2} value={detalhe} onChange={(e) => setDetalhe(e.target.value)} className="input" placeholder="Ex: troca do filtro hidráulico" />
                </label>
              </section>
            </form>
          )}

          {passo === 1 && (
            <form onSubmit={lancar} className="space-y-4" id="form-passo-2">
              <p className="text-sm text-gray-600">
                {avisoFoto ? 'Não deu para ler a foto: preencha os dados da nota.' : 'Confira os dados lidos da foto. Os campos em branco precisam ser preenchidos.'}
              </p>

              <div className="grid grid-cols-3 gap-3">
                <label className="col-span-2 block">
                  <span className="block text-sm text-gray-600 mb-1">Número da nota *</span>
                  <input required inputMode="numeric" maxLength={10} value={dados.numero} onChange={(e) => atualizar('numero', e.target.value.replace(/\D/g, ''))} className="input" />
                </label>
                <label className="block">
                  <span className="block text-sm text-gray-600 mb-1">Série</span>
                  <input value={dados.serie} onChange={(e) => atualizar('serie', e.target.value)} className="input" />
                </label>
              </div>

              <label className="block">
                <span className="block text-sm text-gray-600 mb-1">Data de emissão *</span>
                <input required type="date" max={HOJE} value={dados.data_emissao} onChange={(e) => atualizar('data_emissao', e.target.value)} className="input" />
              </label>

              <div>
                <label className="block">
                  <span className="block text-sm text-gray-600 mb-1">Fornecedor *</span>
                  <select required value={dados.fornecedor_id} onChange={(e) => atualizar('fornecedor_id', e.target.value)} className="input">
                    <option value="">Selecione...</option>
                    {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                </label>
                {fornecedorNovo && String(dados.fornecedor_id) !== '' && (
                  <p className="text-xs text-green-700 mt-1">
                    ✓ Fornecedor <strong>{fornecedorNovo.nome}</strong> cadastrado automaticamente pelo CNPJ da nota.
                    {fornecedorNovo.provisorio && ' O nome é provisório; peça ao administrador para corrigir.'}
                  </p>
                )}
                {fornecedorLido && !dados.fornecedor_id && (
                  <p className="text-xs text-gray-600 mt-1">Lido na foto: <strong>{fornecedorLido}</strong> — não está cadastrado.</p>
                )}
                <button type="button" onClick={() => setNovoFornecedor(true)} className="mt-2 text-sm text-primary font-medium flex items-center gap-1">
                  <Plus size={16} /> Fornecedor não está na lista
                </button>
              </div>

              <fieldset>
                <legend className="text-sm text-gray-600 mb-2">Tipo da nota</legend>
                <div className="grid grid-cols-3 gap-2">
                  {TIPOS_NOTA.map((t) => (
                    <button type="button" key={t.value} aria-pressed={dados.tipo === t.value} onClick={() => atualizar('tipo', t.value)}
                      className={`py-3 rounded-lg text-sm font-medium border ${dados.tipo === t.value ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-200'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {itens.length === 0 ? (
                <label className="block">
                  <span className="block text-sm text-gray-600 mb-1">Valor total (R$) *</span>
                  <input required type="number" inputMode="decimal" step="0.01" min="0.01" value={dados.valor_total} onChange={(e) => atualizar('valor_total', e.target.value)} className="input text-lg" placeholder="0,00" />
                </label>
              ) : (
                <p className="text-sm text-gray-700">
                  {itens.length} item(ns) lido(s) da foto · total{' '}
                  <strong>{itens.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                </p>
              )}

              <div className="rounded-lg bg-white border border-gray-200 p-3 text-sm text-gray-600 space-y-0.5">
                <p><strong className="text-gray-800">Máquina:</strong> {maquinaEscolhida?.codigo}</p>
                <p><strong className="text-gray-800">Motivo:</strong> {motivo}{detalhe.trim() ? ` — ${detalhe.trim()}` : ''}</p>
              </div>
            </form>
          )}
        </main>
      )}

      {!lancada && !isDiretor && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {passo === 1 && (
            <button type="button" onClick={() => { setErro(null); setPasso(0) }} className="flex items-center gap-1 px-4 py-3.5 text-sm text-gray-600 border border-gray-200 rounded-xl">
              <ChevronLeft size={16} /> Voltar
            </button>
          )}
          <button
            type="submit"
            form={passo === 0 ? 'form-passo-1' : 'form-passo-2'}
            disabled={lendo || salvando}
            className="flex-1 bg-primary text-white py-3.5 rounded-xl text-base font-semibold disabled:opacity-60"
          >
            {passo === 0 ? 'Continuar' : salvando ? 'Lançando...' : 'Lançar nota'}
          </button>
        </div>
      )}

      {novoFornecedor && <FornecedorModal onClose={() => setNovoFornecedor(false)} onSave={salvarNovoFornecedor} />}
    </div>
  )
}
