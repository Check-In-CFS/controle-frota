import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../services/auth'
import { ehCelular } from '../utils/dispositivo'

export const INICIO_CELULAR = '/celular'
// No celular só existem estas telas; qualquer outro endereço redireciona para o início do celular.
const ROTAS_CELULAR = [INICIO_CELULAR, '/lancar-nota', '/registrar-manutencao']

export default function RotaProtegida() {
  const { auth } = useAuth()
  const { pathname } = useLocation()

  if (!auth) {
    return <Navigate to="/login" replace />
  }

  if (ehCelular() && !ROTAS_CELULAR.includes(pathname)) {
    return <Navigate to={INICIO_CELULAR} replace />
  }

  return <Outlet />
}
