import axios from 'axios'
import { obterMock } from './mockData'
import { toast } from './toast'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
})

// Adapter usado só no modo Observador: nunca sai da máquina do usuário,
// nunca chama o backend real. Leituras (GET) retornam dados de demonstração;
// qualquer escrita (POST/PUT/PATCH/DELETE) é recusada com uma mensagem clara.
function adapterObservador(config) {
  const metodo = (config.method || 'get').toLowerCase()

  if (metodo === 'get') {
    return Promise.resolve({
      data: obterMock(config.url),
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    })
  }

  const erro = new Error('Ação não permitida no modo Observador (somente leitura).')
  erro.isAxiosError = true
  erro.response = {
    status: 403,
    data: { detail: 'Ação não permitida no modo Observador. Esta é uma visualização somente leitura, com dados de demonstração.' },
  }
  return Promise.reject(erro)
}

api.interceptors.request.use((config) => {
  const salvo = localStorage.getItem('auth')
  if (!salvo) return config

  const { token, papel } = JSON.parse(salvo)

  if (papel === 'observador') {
    config.adapter = adapterObservador
  } else if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

// Avisos automáticos de sucesso para escritas (criar/editar/excluir).
// Rotas que não são "salvar" (login, leitura de XML) ficam de fora.
const SEM_AVISO = ['/auth/', '/importar-xml', '/ler-foto']
const MENSAGEM_SUCESSO = {
  post: 'Salvo com sucesso',
  put: 'Alterações salvas',
  patch: 'Alterações salvas',
  delete: 'Excluído com sucesso',
}

api.interceptors.response.use(
  (response) => {
    const metodo = (response.config.method || '').toLowerCase()
    const url = response.config.url || ''
    if (MENSAGEM_SUCESSO[metodo] && !SEM_AVISO.some((t) => url.includes(t))) {
      toast.sucesso(MENSAGEM_SUCESSO[metodo])
    }
    return response
  },
  (error) => {
    const url = error.config?.url || ''
    // 401 fora do login = sessão expirada: volta ao login e explica o motivo
    if (error.response?.status === 401 && !url.includes('/auth/login')) {
      const tinhaSessao = !!localStorage.getItem('auth')
      localStorage.removeItem('auth')
      if (tinhaSessao) {
        try { sessionStorage.setItem('sessaoExpirada', '1') } catch { /* sem sessionStorage: segue sem aviso */ }
      }
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// Extrai uma mensagem de erro legível da resposta da API, seja ela um texto
// simples (HTTPException) ou uma lista de erros de validação do Pydantic.
export function extrairMensagemErro(err, mensagemPadrao) {
  const detalhe = err.response?.data?.detail
  if (!detalhe) return mensagemPadrao
  if (typeof detalhe === 'string') return detalhe
  if (Array.isArray(detalhe)) {
    return detalhe
      .map((d) => {
        const campo = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : null
        return campo ? `${campo}: ${d.msg}` : d.msg
      })
      .join(' | ')
  }
  return mensagemPadrao
}
