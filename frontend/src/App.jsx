import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Maquinas from './pages/Maquinas'
import Fornecedores from './pages/Fornecedores'
import Manutencoes from './pages/Manutencoes'
import Abastecimentos from './pages/Abastecimentos'
import NotasFiscais from './pages/NotasFiscais'
import Checklist from './pages/Checklist'
import Relatorios from './pages/Relatorios'
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
          <Route path="abastecimentos" element={<Abastecimentos />} />
          <Route path="notas-fiscais" element={<NotasFiscais />} />
          <Route path="checklist" element={<Checklist />} />
          <Route path="relatorios" element={<Relatorios />} />
          <Route path="importacao" element={<EmBreve titulo="Importação" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
