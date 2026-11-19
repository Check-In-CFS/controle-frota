import { api } from './api'

export async function listarProdutos(params = {}) {
  const { data } = await api.get('/produtos', { params })
  return data
}

export async function listarMovimentos(produtoId) {
  const { data } = await api.get(`/produtos/${produtoId}/movimentos`)
  return data
}

export const criarProduto = (payload) => api.post('/produtos', payload).then((r) => r.data)
export const atualizarProduto = (id, payload) => api.patch(`/produtos/${id}`, payload).then((r) => r.data)
export const retirarProduto = (id, payload) => api.post(`/produtos/${id}/retirada`, payload).then((r) => r.data)
export const ajustarProduto = (id, payload) => api.post(`/produtos/${id}/ajuste`, payload).then((r) => r.data)
export const darEntradaMercadoria = (notaId, payload) =>
  api.post(`/notas-fiscais/${notaId}/entrada-mercadoria`, payload).then((r) => r.data)

export const UNIDADES = ['un', 'par', 'kit', 'cx', 'L', 'kg', 'm']
