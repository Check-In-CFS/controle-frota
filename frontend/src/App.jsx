import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './services/auth'
import { DialogoProvider } from './components/DialogoProvider'
import Toaster from './components/Toaster'
import RotaProtegida from './components/RotaProtegida'
import Layout from './components/Layout'
import Carregando from './components/Carregando'
import Login from './pages/Login'
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Maquinas = lazy(() => import('./pages/Maquinas'))
const Fornecedores = lazy(() => import('./pages/Fornecedores'))
const Manutencoes = lazy(() => import('./pages/Manutencoes'))
const Abastecimentos = lazy(() => import('./pages/Abastecimentos'))
const NotasFiscais = lazy(() => import('./pages/NotasFiscais'))
const Checklist = lazy(() => import('./pages/Checklist'))
const Relatorios = lazy(() => import('./pages/Relatorios'))
const Financeiro = lazy(() => import('./pages/Financeiro'))
const CentralDeLogs = lazy(() => import('./pages/CentralDeLogs'))
const Usuarios = lazy(() => import('./pages/Usuarios'))
const LancarNota = lazy(() => import('./pages/LancarNota'))
const NaoEncontrada = lazy(() => import('./pages/NaoEncontrada'))

export default function App() {
  return (
    <AuthProvider>
      <DialogoProvider>
      <Toaster />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<RotaProtegida />}>
            <Route path="lancar-nota" element={<Suspense fallback={<Carregando linhas={5} />}><LancarNota /></Suspense>} />
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="maquinas" element={<Maquinas />} />
              <Route path="fornecedores" element={<Fornecedores />} />
              <Route path="manutencoes" element={<Manutencoes />} />
              <Route path="abastecimentos" element={<Abastecimentos />} />
              <Route path="notas-fiscais" element={<NotasFiscais />} />
              <Route path="checklist" element={<Checklist />} />
              <Route path="relatorios" element={<Relatorios />} />
              <Route path="financeiro" element={<Financeiro />} />
              <Route path="usuarios" element={<Usuarios />} />
              <Route path="logs" element={<CentralDeLogs />} />
              <Route path="*" element={<NaoEncontrada />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
      </DialogoProvider>
    </AuthProvider>
  )
}
