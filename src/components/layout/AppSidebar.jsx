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
   side="right" for RTL — bina-crm's own sidebar left this as "left" despite
   a comment claiming "right" (flagged by the port pass); fixed here. */
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
    <Sidebar side="right" collapsible="icon">
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
            <SidebarMenuButton size="lg" tooltip={name}>
              <UserAvatar user={rep} size="md" />
              <div className="grid flex-1 text-start leading-tight">
                <span className="truncate text-sm font-medium">{name}</span>
              </div>
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
