// Formatação de valores para a tela (padrão brasileiro). Um lugar só, para todas as páginas.

export function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// "2026-11-19" -> "19/11/2026" (sem passar por Date, para não deslocar o dia pelo fuso)
export function formatarData(iso) {
  if (!iso) return '—'
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

export function formatarDataHora(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatarQtd(n) {
  return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}
