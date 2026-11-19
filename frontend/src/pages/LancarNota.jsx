import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, CheckCircle2, ChevronLeft, ImagePlus, Plus, ShieldAlert } from 'lucide-react'
import { useAuth } from '../services/auth'
import { api } from '../services/api'
import { listarMaquinas } from '../services/maquinas'
import {
  TIPOS_NOTA, MOTIVOS_NOTA, montarObservacaoComMotivo,
  lerFotoNotaFiscal, criarNotaFiscal, extrairMensagemErro,
} from '../services/notasFiscais'
import FornecedorModal from '../components/FornecedorModal'
import CelularCabecalho from '../components/CelularCabecalho'
import Secao from '../components/celular/Secao'
import Passos from '../components/celular/Passos'
import ListaMaquinas from '../components/celular/ListaMaquinas'
import { useErrosDeCampo } from '../hooks/useErrosDeCampo'

const HOJE = new Date().toISOString().slice(0, 10)

/**
 * Lançar nota fiscal pelo celular.
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

  const [fotoUrl, setFotoUrl] = useState(null) // pré-visualização local
  const [arquivoUrl, setArquivoUrl] = useState('')
  const [lendo, setLendo] = useState(false)
  const editados = useRef(new Set()) // campos que a pessoa já mexeu: a leitura da foto não sobrescreve
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
    editados.current.add(campo)
    setDados((d) => ({ ...d, [campo]: valor }))
  }

  async function handleFoto(e) {
    const arquivo = e.target.files?.[0]
    e.target.value = '' // permite escolher a mesma foto de novo
    if (!arquivo) return
    setErro(null)
    editados.current = new Set()
    setLendo(true)
    setFotoUrl(URL.createObjectURL(arquivo))
    try {
      const r = await lerFotoNotaFiscal(arquivo)
      const d = r.dados
      setArquivoUrl(r.arquivo_url)
      setAvisoFoto(r.aviso)
      const lidos = {
        ...(d?.numero ? { numero: d.numero } : {}),
        ...(d?.data_emissao ? { data_emissao: d.data_emissao } : {}),
        ...(d?.valor_total != null ? { valor_total: d.valor_total } : {}),
        ...(d?.tipo ? { tipo: d.tipo } : {}),
        ...(d?.fornecedor_id ? { fornecedor_id: d.fornecedor_id } : {}),
      }
      setDados((atual) => {
        const novo = { ...atual }
        for (const [k, v] of Object.entries(lidos)) if (!editados.current.has(k)) novo[k] = v
        return novo
      })
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
      setPasso(0) // se a pessoa já tinha avançado, volta para refazer a foto
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
    if (!arquivoUrl && !lendo) return setErro('Tire a foto da nota para continuar.')
    if (!maquinaId) return setErro('Selecione a máquina.')
    if (!motivo) return setErro('Escolha o motivo.')
    setPasso(1)
    window.scrollTo({ top: 0 })
  }

  async function lancar(e) {
    e.preventDefault()
    setErro(null)
    if (lendo) return
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

  const maquinaEscolhida = maquinas.find((m) => String(m.id) === String(maquinaId))

  return (
    <div ref={raizRef} className="m-app">
      <CelularCabecalho titulo="Lançar nota fiscal" />

      {isDiretor ? (
        <main className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-3">
          <ShieldAlert size={44} className="text-[#5b5f66]" />
          <p className="m-titulo text-2xl">Acesso somente para visualização</p>
          <p className="text-[#5b5f66]">O perfil de diretor não lança notas. Acesse o sistema pelo computador.</p>
        </main>
      ) : lancada ? (
        <main className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2 m-entrada">
          <span className="w-24 h-24 rounded-full bg-sucesso text-white flex items-center justify-center mb-2"><CheckCircle2 size={56} strokeWidth={2.2} /></span>
          <h1 className="m-titulo text-4xl">Nota lançada!</h1>
          <p className="text-[#5b5f66] text-lg">Nota {lancada.numero}/{lancada.serie} · {maquinaEscolhida?.codigo}</p>
          <div className="w-full max-w-sm mt-8 space-y-3">
            <button onClick={novaNota} className="m-botao m-botao-primario">Lançar outra nota</button>
            <Link to="/celular" className="m-botao m-botao-contorno">Voltar ao início</Link>
          </div>
        </main>
      ) : (
        <main className="m-conteudo">
          <Passos atual={passo} nomes={['Foto e máquina', 'Conferir dados']} />

          {erro && <div role="alert" className="m-aviso m-aviso-erro">{erro}</div>}

          {passo === 0 && (
            <form onSubmit={continuar} className="flex flex-col gap-4" id="form-passo-1">
              <Secao numero={1} titulo="Foto da nota" obrigatorio>
                {/* dois campos de arquivo: um abre a câmera, o outro a galeria (sem "capture") */}
                <input id="foto-camera" type="file" accept="image/*" capture="environment" onChange={handleFoto} className="hidden" />
                <input id="foto-galeria" type="file" accept="image/*" onChange={handleFoto} className="hidden" />

                {fotoUrl ? (
                  <img src={fotoUrl} alt="Foto da nota fiscal" className="w-full max-h-64 object-contain bg-[#ece8dc] rounded-2xl border-2 border-giz mb-3" />
                ) : (
                  <div className="m-foto-vazia mb-3"><Camera size={32} aria-hidden="true" /><span>Nenhuma foto ainda</span></div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <label htmlFor="foto-camera" className="m-botao m-botao-escuro flex-col !gap-1 !min-h-[84px] !text-[19px] cursor-pointer">
                    <Camera size={28} />{fotoUrl ? 'Tirar outra' : 'Tirar foto'}
                  </label>
                  <label htmlFor="foto-galeria" className="m-botao m-botao-contorno flex-col !gap-1 !min-h-[84px] !text-[19px] cursor-pointer">
                    <ImagePlus size={28} />{fotoUrl ? 'Outra da galeria' : 'Da galeria'}
                  </label>
                </div>

                <p role="status" className={`m-aviso mt-3 ${arquivoUrl ? 'm-aviso-ok' : lendo ? 'm-aviso-info' : fotoUrl ? 'm-aviso-erro' : ''} ${!arquivoUrl && !lendo && !fotoUrl ? '!p-0 text-[15px] text-[#5b5f66] font-normal' : ''}`}>
                  {lendo ? 'Enviando e lendo a foto...' : arquivoUrl ? '✓ Foto anexada' : fotoUrl ? 'Não foi possível enviar. Tente de novo.' : 'Tire uma foto da nota ou escolha uma que já está no celular.'}
                </p>
                {avisoFoto && <p className="m-ajuda">{avisoFoto}</p>}
              </Secao>

              <Secao numero={2} titulo="Máquina" obrigatorio>
                <ListaMaquinas maquinas={maquinas} escolhida={maquinaId} onEscolher={setMaquinaId} />
              </Secao>

              <Secao numero={3} titulo="Motivo" obrigatorio>
                <div className="grid grid-cols-2 gap-2.5">
                  {MOTIVOS_NOTA.map((m) => (
                    <button type="button" key={m} aria-pressed={motivo === m} onClick={() => setMotivo(m)} className="m-opcao m-opcao-centro !min-h-[64px] !text-[16px] leading-tight">
                      {m}
                    </button>
                  ))}
                </div>
                <label className="block mt-4">
                  <span className="m-rotulo">Detalhe (opcional)</span>
                  <textarea rows={2} value={detalhe} onChange={(e) => setDetalhe(e.target.value)} className="m-input" placeholder="Ex: troca do filtro hidráulico" />
                </label>
              </Secao>
            </form>
          )}

          {passo === 1 && (
            <form onSubmit={lancar} className="flex flex-col gap-4" id="form-passo-2">
              <p className={`m-aviso ${lendo || avisoFoto ? 'm-aviso-info' : 'm-aviso-ok'}`}>
                {lendo ? 'Lendo a foto... os campos em branco serão preenchidos sozinhos. Você já pode ir digitando.' : avisoFoto ? 'Não deu para ler a foto: preencha os dados da nota.' : 'Confira os dados lidos da foto. O que ficou em branco precisa ser preenchido.'}
              </p>

              <Secao titulo="Dados da nota" className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <label className="col-span-2 block">
                    <span className="m-rotulo">Número da nota *</span>
                    <input required inputMode="numeric" maxLength={10} value={dados.numero} onChange={(e) => atualizar('numero', e.target.value.replace(/\D/g, ''))} className="m-input" />
                  </label>
                  <label className="block">
                    <span className="m-rotulo">Série</span>
                    <input value={dados.serie} onChange={(e) => atualizar('serie', e.target.value)} className="m-input" />
                  </label>
                </div>

                <label className="block">
                  <span className="m-rotulo">Data de emissão *</span>
                  <input required type="date" max={HOJE} value={dados.data_emissao} onChange={(e) => atualizar('data_emissao', e.target.value)} className="m-input" />
                </label>

                <div>
                  <label className="block">
                    <span className="m-rotulo">Fornecedor *</span>
                    <select required value={dados.fornecedor_id} onChange={(e) => atualizar('fornecedor_id', e.target.value)} className="m-input">
                      <option value="">Selecione...</option>
                      {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                  </label>
                  {fornecedorNovo && String(dados.fornecedor_id) !== '' && (
                    <p className="m-aviso m-aviso-ok mt-2">
                      ✓ Fornecedor <strong>{fornecedorNovo.nome}</strong> cadastrado automaticamente pelo CNPJ da nota.
                      {fornecedorNovo.provisorio && ' O nome é provisório; peça ao administrador para corrigir.'}
                    </p>
                  )}
                  {fornecedorLido && !dados.fornecedor_id && (
                    <p className="m-aviso m-aviso-info mt-2">Lido na foto: <strong>{fornecedorLido}</strong> — não está cadastrado.</p>
                  )}
                  <button type="button" onClick={() => setNovoFornecedor(true)} className="mt-3 min-h-[44px] text-[16px] font-bold underline underline-offset-4 flex items-center gap-1.5">
                    <Plus size={18} /> Fornecedor não está na lista
                  </button>
                </div>

                <fieldset>
                  <legend className="m-rotulo">Tipo da nota</legend>
                  <div className="grid grid-cols-3 gap-2.5">
                    {TIPOS_NOTA.map((t) => (
                      <button type="button" key={t.value} aria-pressed={dados.tipo === t.value} onClick={() => atualizar('tipo', t.value)} className="m-opcao m-opcao-centro">{t.label}</button>
                    ))}
                  </div>
                </fieldset>

                {itens.length === 0 ? (
                  <label className="block">
                    <span className="m-rotulo">Valor total (R$) *</span>
                    <input required type="number" inputMode="decimal" step="0.01" min="0.01" value={dados.valor_total} onChange={(e) => atualizar('valor_total', e.target.value)} className="m-input !text-[26px] font-bold" placeholder="0,00" />
                  </label>
                ) : (
                  <p className="m-aviso m-aviso-info">
                    {itens.length} item(ns) lido(s) da foto · total{' '}
                    <strong>{itens.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                  </p>
                )}
              </Secao>

              <div className="rounded-2xl bg-tinta text-white p-4">
                <p className="m-titulo text-lg text-castelo mb-2">Resumo</p>
                <p><span className="text-white/60">Máquina</span> · <strong>{maquinaEscolhida?.codigo}</strong></p>
                <p className="mt-0.5"><span className="text-white/60">Motivo</span> · <strong>{motivo}</strong>{detalhe.trim() ? ` — ${detalhe.trim()}` : ''}</p>
              </div>
            </form>
          )}
        </main>
      )}

      {!lancada && !isDiretor && (
        <div className="m-barra">
          {passo === 1 && (
            <button type="button" onClick={() => { setErro(null); setPasso(0) }} className="m-botao m-botao-contorno m-botao-voltar" aria-label="Voltar ao passo 1">
              <ChevronLeft size={26} />
            </button>
          )}
          <button type="submit" form={passo === 0 ? 'form-passo-1' : 'form-passo-2'} disabled={salvando || (passo === 1 && lendo)} className="m-botao m-botao-primario">
            {passo === 0 ? 'Continuar' : salvando ? 'Lançando...' : lendo ? 'Lendo a foto...' : 'Lançar nota'}
          </button>
        </div>
      )}

      {novoFornecedor && <FornecedorModal onClose={() => setNovoFornecedor(false)} onSave={salvarNovoFornecedor} />}
    </div>
  )
}
