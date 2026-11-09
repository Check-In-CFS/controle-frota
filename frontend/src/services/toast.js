// Emissor simples de avisos (toasts): permite disparar de qualquer lugar,
// inclusive de fora de componentes React (ex: interceptor do axios).
const ouvintes = new Set()
let proximoId = 1

export function assinarToasts(fn) {
  ouvintes.add(fn)
  return () => ouvintes.delete(fn)
}

function emitir(tipo, mensagem) {
  const toast = { id: proximoId++, tipo, mensagem }
  ouvintes.forEach((fn) => fn(toast))
}

export const toast = {
  sucesso: (mensagem) => emitir('sucesso', mensagem),
  erro: (mensagem) => emitir('erro', mensagem),
}
