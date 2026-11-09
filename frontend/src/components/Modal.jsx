import { useEffect, useRef } from 'react'

const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Pilha de modais abertos: Esc e Tab só valem para o de cima (ex: Fornecedor aberto dentro de Nota Fiscal)
const pilha = []

/**
 * Casca padrão de todos os modais: fundo escurecido, role="dialog", fecha com Esc,
 * mantém o foco do teclado dentro do modal e devolve o foco ao botão que o abriu.
 *
 * Por padrão NÃO fecha ao clicar fora (evita perder um formulário preenchido por
 * um toque sem querer no celular). Os modais só de leitura passam `fecharAoClicarFora`.
 */
export default function Modal({ onClose, fecharAoClicarFora = false, children }) {
  const fundoRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const pressionouNoFundo = useRef(false)

  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    const anterior = document.activeElement
    const fundo = fundoRef.current
    pilha.push(fundo)

    // Foca o primeiro campo do conteúdo (ou o próprio diálogo, se não houver nenhum)
    const conteudo = fundo.querySelector('form, [data-modal-conteudo]') || fundo
    const primeiro = conteudo.querySelector('input:not([type=hidden]), select, textarea')
    if (primeiro) primeiro.focus()
    else fundo.focus()

    function aoTeclar(e) {
      if (pilha[pilha.length - 1] !== fundo) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current?.()
        return
      }
      if (e.key !== 'Tab') return
      const itens = [...fundo.querySelectorAll(FOCAVEIS)].filter((el) => el.offsetParent !== null)
      if (itens.length === 0) return
      const primeiroItem = itens[0]
      const ultimoItem = itens[itens.length - 1]
      if (e.shiftKey && document.activeElement === primeiroItem) {
        e.preventDefault()
        ultimoItem.focus()
      } else if (!e.shiftKey && document.activeElement === ultimoItem) {
        e.preventDefault()
        primeiroItem.focus()
      }
    }

    // Validação dos formulários: em vez da bolha do navegador, mostra a mensagem
    // logo abaixo do campo com problema e destaca a borda em vermelho.
    function removerErro(el) {
      el.removeAttribute('aria-invalid')
      const msg = el.nextElementSibling
      if (msg?.hasAttribute('data-erro-campo')) msg.remove()
    }
    function aoInvalidar(e) {
      e.preventDefault()
      const el = e.target
      removerErro(el)
      el.setAttribute('aria-invalid', 'true')
      const msg = document.createElement('p')
      msg.setAttribute('data-erro-campo', '')
      msg.setAttribute('role', 'alert')
      msg.className = 'text-xs text-red-600 mt-1'
      msg.textContent = el.validationMessage || 'Campo inválido'
      el.insertAdjacentElement('afterend', msg)
      if (el.form?.querySelector(':invalid') === el) {
        el.focus()
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    }
    function aoDigitar(e) {
      const el = e.target
      if (el.getAttribute?.('aria-invalid') === 'true' && el.validity?.valid) removerErro(el)
    }

    fundo.addEventListener('invalid', aoInvalidar, true)
    fundo.addEventListener('input', aoDigitar)
    fundo.addEventListener('change', aoDigitar)
    document.addEventListener('keydown', aoTeclar)
    return () => {
      fundo.removeEventListener('invalid', aoInvalidar, true)
      fundo.removeEventListener('input', aoDigitar)
      fundo.removeEventListener('change', aoDigitar)
      document.removeEventListener('keydown', aoTeclar)
      pilha.splice(pilha.indexOf(fundo), 1)
      if (anterior && document.contains(anterior)) anterior.focus()
    }
  }, [])

  return (
    <div
      ref={fundoRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4 outline-none"
      onMouseDown={(e) => { pressionouNoFundo.current = e.target === e.currentTarget }}
      onMouseUp={(e) => {
        if (fecharAoClicarFora && pressionouNoFundo.current && e.target === e.currentTarget) onClose?.()
        pressionouNoFundo.current = false
      }}
    >
      {children}
    </div>
  )
}
