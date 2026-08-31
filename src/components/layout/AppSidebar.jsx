import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  useSidebar,
} from '../ui/sidebar'
import UserAvatar from '../UserAvatar'
import Icon from '../Icon'
import { NAV_GROUPS } from './nav-data'

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
  const { isMobile, setOpenMobile } = useSidebar()
  const loc = useLocation()
  const nav = useNavigate()
  const name = rep?.full_name || user?.email

  const isActive = (item) =>
    item.end ? loc.pathname === item.path : loc.pathname === item.path || loc.pathname.startsWith(item.path + '/')

  const close = () => { if (isMobile) setOpenMobile(false) }

  return (
    <Sidebar side="left" collapsible="icon">
      <SidebarHeader className="h-16 justify-center px-4 group-data-[collapsible=icon]:px-0">
        <span className="group-data-[collapsible=icon]:hidden text-lg font-bold">TRAX CRM</span>
        <span className="text-sidebar-primary-foreground bg-sidebar-primary mx-auto hidden size-8 shrink-0 items-center justify-center rounded-lg text-lg font-bold group-data-[collapsible=icon]:flex"
          aria-hidden="true">T</span>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group, i) => (
          <SidebarGroup key={group.key ?? i}>
            {group.title && <SidebarGroupLabel>{group.title}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map(item => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton asChild isActive={isActive(item)} tooltip={item.label}>
                      <NavLink to={item.path} end={item.end} onClick={close}>
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
            <SidebarMenuButton asChild size="lg" isActive={loc.pathname === '/profile'} tooltip="הפרופיל שלי">
              <NavLink to="/profile" onClick={close}>
                <UserAvatar user={rep} size="md" />
                <div className="grid flex-1 text-start leading-tight">
                  <span className="truncate text-sm font-medium">{name}</span>
                  <span className="text-sidebar-foreground/60 truncate text-xs">הפרופיל שלי</span>
                </div>
              </NavLink>
            </SidebarMenuButton>
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
