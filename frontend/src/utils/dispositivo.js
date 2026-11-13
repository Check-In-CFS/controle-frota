// Detecta se o aparelho é um CELULAR (tablet e computador não contam).
// O navegador informa isso por conta própria, então serve para adaptar a interface --
// não é uma barreira de segurança (quem quiser pode pedir o "site para computador").
export function ehCelular() {
  if (typeof navigator === 'undefined') return false
  const dados = navigator.userAgentData
  if (dados && typeof dados.mobile === 'boolean') return dados.mobile
  return /Android.+Mobile|iPhone|iPod|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile/i.test(navigator.userAgent)
}
