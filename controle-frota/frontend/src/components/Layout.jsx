import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  Truck,
  Wrench,
  Fuel,
  Briefcase,
  FileText,
  CheckSquare,
  BarChart3,
  Upload,
} from 'lucide-react'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/maquinas', label: 'Máquinas', icon: Truck },
  { to: '/manutencoes', label: 'Manutenções', icon: Wrench },
  { to: '/abastecimentos', label: 'Abastecimentos', icon: Fuel },
  { to: '/fornecedores', label: 'Fornecedores', icon: Briefcase },
  { to: '/notas-fiscais', label: 'Notas Fiscais', icon: FileText },
  { to: '/checklist', label: 'Checklist', icon: CheckSquare },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { to: '/importacao', label: 'Importação', icon: Upload },
]

export default function Layout() {
  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-gray-100">
          <Truck className="text-primary" size={24} />
          <span className="font-semibold text-gray-800">Controle de Frota</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-primary font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  )
}
