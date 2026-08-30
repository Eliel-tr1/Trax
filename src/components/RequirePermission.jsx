import { Link } from 'react-router-dom'
import { ShieldOff } from 'lucide-react'
import { usePermissionStore, RESOURCES } from '../stores/permissionStore'
import { Card, CardContent } from './ui/card'

/* Route guard.

   Hiding a link in the sidebar is presentation, not access control: the URL is
   still typeable. This blocks the route itself, so a sales rep who pastes
   /attendance gets told no instead of quietly loading the screen. */
export default function RequirePermission({ resource, children }) {
  const can = usePermissionStore(s => s.can)
  const loading = usePermissionStore(s => s.loading)

  if (loading) return <div className="empty"><span className="spinner" /></div>
  if (!resource || can(resource, 'view')) return children

  /* Deliberately NOT a silent redirect: bouncing someone to the dashboard
     leaves them wondering whether the link is broken. Say what happened. */

  const label = RESOURCES.find(r => r.key === resource)?.label || resource
  return (
    <Card className="mx-auto mt-10 max-w-md">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
          <ShieldOff className="size-6" />
        </span>
        <p className="font-semibold">אין לך הרשאה לצפות במסך "{label}"</p>
        <p className="text-muted-foreground text-sm">פנו למנהל המערכת כדי לקבל גישה.</p>
        {can('dashboard', 'view') && (
          <Link to="/" className="text-primary mt-1 text-sm font-medium underline-offset-4 hover:underline">
            חזרה לדשבורד
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
