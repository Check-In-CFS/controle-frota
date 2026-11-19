import { useState } from 'react'
import { X, Pencil, PackagePlus, Image as IconeFoto } from 'lucide-react'
import { labelTipoNota, obterUrlFotoNota } from '../services/notasFiscais'
import Modal from './Modal'
import { formatarMoeda, formatarData, formatarDataHora } from '../utils/formatar'
import { extrairMensagemErro } from '../services/api'

export default function NotaFiscalDetalheModal({ nota, centrosDespesa, onClose, onEditar, onEntrada }) {
  const [abrindoFoto, setAbrindoFoto] = useState(false)
  const [erroFoto, setErroFoto] = useState(null)

  if (!nota) return null

  async function verFoto() {
    setErroFoto(null)
    setAbrindoFoto(true)
    try {
      const url = await obterUrlFotoNota(nota.id)
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      setErroFoto(extrairMensagemErro(err, 'Não foi possível abrir a foto.'))
    } finally {
      setAbrindoFoto(false)
    }
  }

  const centroDespesa = centrosDespesa.find((c) => c.id === nota.centro_despesa_id)?.nome

  return (
    <Modal onClose={onClose} fecharAoClicarFora>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">
            Nota Fiscal {nota.numero} / {nota.serie}
          </h2>
          <div className="flex items-center gap-2">
            {onEntrada && nota.itens?.some((i) => i.quantidade > (i.quantidade_recebida || 0)) && (
              <button
                onClick={onEntrada}
                className="flex items-center gap-1.5 text-sm text-white bg-primary hover:bg-primary-dark px-3 py-1.5 rounded-lg"
              >
                <PackagePlus size={14} /> Dar entrada de mercadoria
              </button>
            )}
            {onEditar && (
              <button
                onClick={onEditar}
                className="flex items-center gap-1.5 text-sm text-primary hover:bg-indigo-50 px-3 py-1.5 rounded-lg"
              >
                <Pencil size={14} /> Editar
              </button>
            )}
            <button onClick={onClose} className="text-gray-500 hover:text-gray-600 p-1.5" aria-label="Fechar" title="Fechar">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {nota.arquivo_url && (
            <div>
              <button
                onClick={verFoto}
                disabled={abrindoFoto}
                className="flex items-center gap-2 text-sm font-medium text-primary border border-primary/30 rounded-lg px-4 py-2.5 hover:bg-indigo-50 disabled:opacity-60"
              >
                <IconeFoto size={16} /> {abrindoFoto ? 'Abrindo...' : 'Ver foto da nota'}
              </button>
              {erroFoto && <p role="alert" className="text-sm text-red-600 mt-2">{erroFoto}</p>}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo label="Data de Emissão" valor={formatarData(nota.data_emissao)} />
            <Campo label="Tipo" valor={labelTipoNota(nota.tipo)} />
            <Campo label="Fornecedor" valor={nota.fornecedor_nome || '—'} />
            <Campo label="Centro de Despesa" valor={centroDespesa || '—'} />
            <Campo label="Valor Total" valor={formatarMoeda(nota.valor_total)} destaque />
            <Campo label="Cadastrada em" valor={formatarDataHora(nota.created_at)} />
          </div>

          <div>
            <span className="block text-sm text-gray-500 mb-2">Máquinas vinculadas</span>
            {nota.maquinas?.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {nota.maquinas.map((codigo) => (
                  <span key={codigo} className="text-xs font-medium bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                    {codigo}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Nenhuma máquina vinculada.</p>
            )}
          </div>

          <div>
            <span className="block text-sm text-gray-500 mb-2">Itens da nota</span>
            {nota.itens?.length > 0 ? (
              <div className="border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-500">
                      <th className="px-3 py-2 font-medium">Nome</th>
                      <th className="px-3 py-2 font-medium">Qtd.</th>
                      <th className="px-3 py-2 font-medium">Vlr. Unit.</th>
                      <th className="px-3 py-2 font-medium">Subtotal</th>
                      <th className="px-3 py-2 font-medium">Estoque</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nota.itens.map((item) => (
                      <tr key={item.id} className="border-t border-gray-100">
                        <td className="px-3 py-2">{item.nome}</td>
                        <td className="px-3 py-2">{item.quantidade}</td>
                        <td className="px-3 py-2">{formatarMoeda(item.valor_unitario)}</td>
                        <td className="px-3 py-2 font-medium">{formatarMoeda(item.quantidade * item.valor_unitario)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {item.quantidade_recebida >= item.quantidade
                            ? <span className="text-xs font-medium bg-green-50 text-green-700 px-2 py-0.5 rounded-full">No estoque</span>
                            : item.quantidade_recebida > 0
                              ? <span className="text-xs font-medium bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">Parcial ({item.quantidade_recebida}/{item.quantidade})</span>
                              : <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Aguardando entrada</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Nenhum item detalhado nesta nota.</p>
            )}
          </div>

          {nota.observacoes && (
            <div>
              <span className="block text-sm text-gray-500 mb-1">Observações</span>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{nota.observacoes}</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

function Campo({ label, valor, destaque = false }) {
  return (
    <div>
      <span className="block text-xs text-gray-500 mb-0.5">{label}</span>
      <span className={destaque ? 'text-base font-semibold text-gray-800' : 'text-sm text-gray-700'}>{valor}</span>
    </div>
  )
}
