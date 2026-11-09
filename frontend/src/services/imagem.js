// Reduz a foto no próprio celular antes de enviar: foto de câmera pode ter 5-10 MB,
// e para ler uma nota 1800 px de lado sobram. Se o navegador não conseguir abrir a
// imagem, devolve o arquivo original e o servidor decide.
export async function reduzirImagem(arquivo, ladoMaximo = 1800, qualidade = 0.85) {
  try {
    const bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' })
    const escala = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * escala)
    canvas.height = Math.round(bitmap.height * escala)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', qualidade))
    return blob || arquivo
  } catch {
    return arquivo
  }
}
