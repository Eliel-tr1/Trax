import { Outlet, useLocation } from 'react-router-dom'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '../ui/sidebar'
import { Separator } from '../ui/separator'
import AppSidebar from './AppSidebar'
import GlobalSearch from '../GlobalSearch'
import Notifications from '../Notifications'
import Toaster from '../Toaster'
import DialogHost from '../Dialogs'
import BusinessUnitSwitcher from './BusinessUnitSwitcher'
import ThemeToggle from '../ThemeToggle'
import ImpersonationBar from './ImpersonationBar'
import Onboarding from '../Onboarding'
import { titleForPath } from './nav-data'

export default function AppLayout() {
  const loc = useLocation()

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0 overflow-x-hidden">
        <ImpersonationBar variant="banner" />
        <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
          <SidebarTrigger className="-ms-1" />
          <Separator orientation="vertical" className="me-1 h-5" />
          <h1 className="hidden min-w-0 truncate text-lg font-bold sm:block">{titleForPath(loc.pathname)}</h1>
          <div className="ms-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <BusinessUnitSwitcher />
            <GlobalSearch />
            <Notifications />
            <ThemeToggle />
            <ImpersonationBar variant="trigger" />
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 pb-16 md:p-6">
          <Outlet />
        </main>
        <Toaster />
        <DialogHost />
        <Onboarding />
      </SidebarInset>
    </SidebarProvider>
  )
}
