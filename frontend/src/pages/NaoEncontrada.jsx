import { Link } from 'react-router-dom'
import { SearchX } from 'lucide-react'

export default function NaoEncontrada() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-4">
      <SearchX size={44} className="text-gray-500 mb-4" />
      <h1 className="text-xl font-semibold text-gray-800">Página não encontrada</h1>
      <p className="text-sm text-gray-600 mt-1 mb-6">O endereço que você acessou não existe ou foi movido.</p>
      <Link to="/" className="bg-primary text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary-dark">
        Voltar ao início
      </Link>
    </div>
  )
}
