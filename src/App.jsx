import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DirectionProvider } from '@radix-ui/react-direction'
import { CoreAdminContext } from 'ra-core'
import { Toaster as SonnerToaster } from 'sonner'
import { useAuthStore } from './stores/authStore'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import MyDesk from './pages/MyDesk'
import Customers from './pages/Customers'
import CustomerDetail from './pages/CustomerDetail'
import Sales from './pages/Sales'
import SaleDetail from './pages/SaleDetail'
import Journeys from './pages/Journeys'
import JourneyDetail from './pages/JourneyDetail'
import Registrations from './pages/Registrations'
import RegistrationDetail from './pages/RegistrationDetail'
import Meetings from './pages/Meetings'
import MeetingDetail from './pages/MeetingDetail'
import PhoneCalls from './pages/PhoneCalls'
import PhoneCallDetail from './pages/PhoneCallDetail'
import Tasks from './pages/Tasks'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import RequirePermission from './components/RequirePermission'
import CelebrationHost from './components/Celebration'
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
              <Route path="my-desk" element={<RequirePermission resource="dashboard"><MyDesk /></RequirePermission>} />
              <Route path="customers" element={<RequirePermission resource="customers"><Customers /></RequirePermission>} />
              <Route path="customers/:id" element={<RequirePermission resource="customers"><CustomerDetail /></RequirePermission>} />
              <Route path="sales" element={<RequirePermission resource="sales"><Sales /></RequirePermission>} />
              <Route path="sales/:id" element={<RequirePermission resource="sales"><SaleDetail /></RequirePermission>} />
              <Route path="journeys" element={<RequirePermission resource="journeys"><Journeys /></RequirePermission>} />
              <Route path="journeys/:id" element={<RequirePermission resource="journeys"><JourneyDetail /></RequirePermission>} />
              <Route path="registrations" element={<RequirePermission resource="registrations"><Registrations /></RequirePermission>} />
              <Route path="registrations/:id" element={<RequirePermission resource="registrations"><RegistrationDetail /></RequirePermission>} />
              <Route path="meetings" element={<RequirePermission resource="meetings"><Meetings /></RequirePermission>} />
              <Route path="meetings/:id" element={<RequirePermission resource="meetings"><MeetingDetail /></RequirePermission>} />
              <Route path="phone-calls" element={<RequirePermission resource="phone_calls"><PhoneCalls /></RequirePermission>} />
              <Route path="phone-calls/:id" element={<RequirePermission resource="phone_calls"><PhoneCallDetail /></RequirePermission>} />
              <Route path="tasks" element={<RequirePermission resource="tasks"><Tasks /></RequirePermission>} />
              <Route path="profile" element={<Profile />} />
              <Route path="settings" element={<RequirePermission resource="settings"><Settings /></RequirePermission>} />
              <Route path="*" element={<Navigate to="/" />} />
            </Route>
          </Routes>
        </CoreAdminContext>
      </HashRouter>
      <SonnerToaster />
      <CelebrationHost />
    </DirectionProvider>
  )
}
