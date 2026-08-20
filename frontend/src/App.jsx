import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Maquinas from './pages/Maquinas'
import Fornecedores from './pages/Fornecedores'
import Manutencoes from './pages/Manutencoes'
import EmBreve from './pages/EmBreve'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="maquinas" element={<Maquinas />} />
          <Route path="fornecedores" element={<Fornecedores />} />
          <Route path="manutencoes" element={<Manutencoes />} />
          <Route path="abastecimentos" element={<EmBreve titulo="Abastecimentos" />} />
          <Route path="notas-fiscais" element={<EmBreve titulo="Notas Fiscais" />} />
          <Route path="checklist" element={<EmBreve titulo="Checklist" />} />
          <Route path="relatorios" element={<EmBreve titulo="Relatórios" />} />
          <Route path="importacao" element={<EmBreve titulo="Importação" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
