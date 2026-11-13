import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Castle, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../services/auth'

export default function Login() {
  const { login, entrarComoObservador } = useAuth()
  const navigate = useNavigate()

  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [erro, setErro] = useState(() => {
    try {
      if (sessionStorage.getItem('sessaoExpirada')) {
        sessionStorage.removeItem('sessaoExpirada')
        return 'Sua sessão expirou. Entre novamente para continuar.'
      }
    } catch { /* sem sessionStorage */ }
    return null
  })
  const [entrando, setEntrando] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setErro(null)
    setEntrando(true)
    try {
      await login(usuario, senha)
      navigate('/')
    } catch (err) {
      setErro(err.response?.data?.detail || 'Usuário ou senha inválidos')
    } finally {
      setEntrando(false)
    }
  }

  function handleObservador() {
    entrarComoObservador()
    navigate('/')
  }

  return (
    <div className="m-app">
      <div className="bg-tinta text-white">
        <div className="max-w-md mx-auto px-6 pt-[max(40px,env(safe-area-inset-top))] pb-10 m-entrada">
          <span className="m-marca !w-14 !h-14 !rounded-2xl"><Castle size={32} strokeWidth={2.2} /></span>
          <p className="m-titulo text-[17px] text-castelo mt-5 tracking-[0.12em]">Castelo Forte</p>
          <h1 className="m-titulo text-[46px] mt-1">Controle<br />de Frota</h1>
        </div>
        <div className="m-faixa" aria-hidden="true" />
      </div>

      <main className="flex-1 w-full max-w-md mx-auto px-5 py-7 m-entrada" style={{ animationDelay: '90ms' }}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {erro && <div role="alert" className="m-aviso m-aviso-erro">{erro}</div>}

          <label className="block">
            <span className="m-rotulo">Usuário</span>
            <input
              required
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              className="m-input"
            />
          </label>

          <label className="block">
            <span className="m-rotulo">Senha</span>
            <div className="relative">
              <input
                required
                type={mostrarSenha ? 'text' : 'password'}
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="m-input pr-14"
              />
              <button
                type="button"
                onClick={() => setMostrarSenha((v) => !v)}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center text-[#5b5f66]"
                aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {mostrarSenha ? <EyeOff size={22} /> : <Eye size={22} />}
              </button>
            </div>
          </label>

          <button type="submit" disabled={entrando} className="m-botao m-botao-primario !mt-6">
            {entrando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="text-[15px] text-[#5b5f66] mt-5 text-center">Não tem acesso? Peça a criação do seu usuário ao administrador do sistema.</p>

        <div className="mt-8 pt-6 border-t-2 border-giz">
          <button type="button" onClick={handleObservador} className="m-botao m-botao-contorno !min-h-[52px] !text-[18px]">
            Entrar como observador
          </button>
          <p className="text-[14px] text-[#5b5f66] mt-2 text-center">Visualiza o sistema com dados de demonstração, sem acesso ao banco real.</p>
        </div>
      </main>
    </div>
  )
}
