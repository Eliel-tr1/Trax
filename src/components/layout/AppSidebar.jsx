import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useBusinessUnitStore } from '../../stores/businessUnitStore'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  useSidebar,
} from '../ui/sidebar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'
import UserAvatar from '../UserAvatar'
import Icon from '../Icon'
import { orderedGroups } from './nav-data'
import logoHeader from '../../assets/logo-header.png'

/* TRAX rewrite of bina-crm's AppSidebar.jsx: same Sidebar primitive, no
   permission-driven collapse/pin logic (spec: 2 users, both full owners —
   see docs/blockers.md), so every group is always open.
   side="left" for a right-hand RTL sidebar — this shadcn Sidebar primitive
   positions with LOGICAL props, so side="right" means inline-end, which is
   the visual LEFT in RTL. bina-crm hit and documented this exact trap; a
   previous pass here inverted the fix by misreading that note. Verified
   live 2026-08-31: side="left" renders on the visual right in this RTL app. */
export default function AppSidebar() {
  const { user, rep, signOut } = useAuthStore()
  const unit = useBusinessUnitStore(s => s.unit)
  const { isMobile, setOpenMobile } = useSidebar()
  const loc = useLocation()
  const nav = useNavigate()
  const name = rep?.full_name || user?.email
  // Business-unit branding (Goldi, 01.09: "when clicking Xcon the sidebar
  // should switch to Xcon CRM and its logo"). Logo falls back to the TRAX
  // one until a dedicated Xcon asset lands in src/assets/.
  const brandTitle = unit === 'Xcon' ? 'Xcon CRM' : 'TRAX CRM'

  const isActive = (item) =>
    item.end ? loc.pathname === item.path : loc.pathname === item.path || loc.pathname.startsWith(item.path + '/')

  const close = () => { if (isMobile) setOpenMobile(false) }

  return (
    <Sidebar side="left" collapsible="icon">
      <SidebarHeader className="h-16 flex-row items-center justify-center gap-2 px-4 group-data-[collapsible=icon]:px-0">
        <img src={logoHeader} alt={unit} className="size-8 shrink-0 rounded-md object-contain" />
        <span className="group-data-[collapsible=icon]:hidden text-lg font-bold">{brandTitle}</span>
      </SidebarHeader>

      <SidebarContent>
        {orderedGroups(rep?.prefs).map((group, i) => (
          <SidebarGroup key={group.key ?? i}>
            {group.title && <SidebarGroupLabel>{group.title}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map(item => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton asChild isActive={isActive(item)} tooltip={item.label}>
                      <NavLink to={item.path} end={item.end} onClick={close} data-tour-nav={item.path}>
                        <Icon name={item.icon} size={17} />
                        <span>{item.label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  isActive={loc.pathname === '/profile' || loc.pathname === '/settings'}
                  tooltip={name}
                  data-tour="sidebar-user"
                >
                  <UserAvatar user={rep} size="md" />
                  <div className="grid flex-1 text-start leading-tight">
                    <span className="truncate text-sm font-medium">{name}</span>
                    <span className="text-sidebar-foreground/60 truncate text-xs">הפרופיל שלי</span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuItem onClick={() => { close(); nav('/profile') }}>
                  <Icon name="user-plus" size={15} />
                  <span>הפרופיל שלי</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { close(); nav('/settings') }}>
                  <Icon name="cog" size={15} />
                  <span>הגדרות מערכת</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} tooltip="התנתקות">
              <LogOut className="size-4" />
              <span>התנתקות</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
