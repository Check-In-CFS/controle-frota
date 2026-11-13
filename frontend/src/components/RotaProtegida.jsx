import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../services/auth'
import { ehCelular } from '../utils/dispositivo'

export const ROTA_CELULAR = '/lancar-nota'

export default function RotaProtegida() {
  const { auth } = useAuth()
  const { pathname } = useLocation()

  if (!auth) {
    return <Navigate to="/login" replace />
  }

  // No celular só existe a tela de lançar nota; qualquer outro endereço redireciona para ela.
  if (ehCelular() && pathname !== ROTA_CELULAR) {
    return <Navigate to={ROTA_CELULAR} replace />
  }

  return <Outlet />
}
