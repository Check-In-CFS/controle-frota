import { useEffect } from 'react'

/**
 * Validação de formulário com a mensagem logo abaixo do campo (em vez da bolha do
 * navegador): destaca a borda em vermelho, foca o primeiro campo inválido e limpa o
 * erro assim que o campo fica válido. `ref` é o elemento que contém o(s) formulário(s).
 */
export function useErrosDeCampo(ref) {
  useEffect(() => {
    const raiz = ref.current
    if (!raiz) return

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

    raiz.addEventListener('invalid', aoInvalidar, true)
    raiz.addEventListener('input', aoDigitar)
    raiz.addEventListener('change', aoDigitar)
    return () => {
      raiz.removeEventListener('invalid', aoInvalidar, true)
      raiz.removeEventListener('input', aoDigitar)
      raiz.removeEventListener('change', aoDigitar)
    }
  }, [ref])
}
