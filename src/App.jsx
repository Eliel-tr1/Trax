import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DirectionProvider } from '@radix-ui/react-direction'
import { CoreAdminContext } from 'ra-core'
import { Toaster as SonnerToaster } from 'sonner'
import { useAuthStore } from './stores/authStore'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import CustomerDetail from './pages/CustomerDetail'
import Sales from './pages/Sales'
import SaleDetail from './pages/SaleDetail'
import Tasks from './pages/Tasks'
import RequirePermission from './components/RequirePermission'
import { dataProvider, authProvider, i18nProvider, raStore } from './lib/ra/providers'

function Loading() {
  return (
    <div className="center-screen">
      <div style={{ textAlign: 'center' }}>
        <div style={{ marginBottom: 18, fontWeight: 700, fontSize: '1.4rem' }}>TRAX CRM</div>
        <div className="spinner light" />
      </div>
    </div>
  )
}

export default function App() {
  const { user, loading, initialize } = useAuthStore()

  useEffect(() => { initialize() }, [])

  if (loading) return <Loading />
  if (!user) return (
    <DirectionProvider dir="rtl">
      <HashRouter>
        <Routes><Route path="*" element={<LoginPage />} /></Routes>
        <SonnerToaster />
      </HashRouter>
    </DirectionProvider>
  )

  return (
    // Radix positions menus/selects/popovers from its own direction context,
    // not from the document's dir attribute — without this every dropdown
    // would lay out LTR inside an RTL app (bina-crm lesson, see its App.jsx).
    <DirectionProvider dir="rtl">
      <HashRouter>
        {/* ra-core context only — our router, layout and authStore stay in
            charge; this is what lets components/admin (DataTable, filters,
            saved queries) work inside our own pages. */}
        <CoreAdminContext dataProvider={dataProvider} authProvider={authProvider} i18nProvider={i18nProvider} store={raStore}>
          <Routes>
            <Route path="/" element={<AppLayout />}>
              <Route index element={<RequirePermission resource="dashboard"><Dashboard /></RequirePermission>} />
              <Route path="customers" element={<RequirePermission resource="customers"><Customers /></RequirePermission>} />
              <Route path="customers/:id" element={<RequirePermission resource="customers"><CustomerDetail /></RequirePermission>} />
              <Route path="sales" element={<RequirePermission resource="sales"><Sales /></RequirePermission>} />
              <Route path="sales/:id" element={<RequirePermission resource="sales"><SaleDetail /></RequirePermission>} />
              <Route path="tasks" element={<RequirePermission resource="tasks"><Tasks /></RequirePermission>} />
              <Route path="*" element={<Navigate to="/" />} />
            </Route>
          </Routes>
        </CoreAdminContext>
      </HashRouter>
      <SonnerToaster />
    </DirectionProvider>
  )
}
