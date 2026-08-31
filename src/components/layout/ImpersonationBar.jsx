import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { usePermissionStore } from '../../stores/permissionStore'
import { Button } from '../ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '../ui/dialog'
import { Input } from '../ui/input'
import UserAvatar from '../UserAvatar'
import { toast } from '../Toaster'

/* "View as user" — ported from bina-crm's ImpersonationBar.jsx.

   Restricted to permission_profile === 'מנהל מערכת' (see Settings.jsx's
   InviteUserModal for where that field is set) — a lower profile can't open
   the picker even though the trigger button itself only renders for admins,
   because the target's matrix is applied client-side (see permissionStore's
   startImpersonation), so gating the entry point is the real control here.

   This is a LENS, not a login: the Supabase auth session never changes, so
   anything written while impersonating is still attributed to the real
   admin. The banner is deliberately loud and always present. Split into two
   variants like the original — 'banner' for the top-of-page notice, 'trigger'
   for the header button — so a single component instance never renders both
   at once. */
export default function ImpersonationBar({ variant = 'banner' }) {
  const rep = useAuthStore(s => s.rep)
  const { impersonating, startImpersonation, stopImpersonation } = usePermissionStore()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState([])
  const [q, setQ] = useState('')

  const isSystemAdmin = rep?.permission_profile === 'מנהל מערכת'

  useEffect(() => {
    if (!open) return
    supabase.from('app_users')
      .select('id, full_name, avatar_url, is_active, department, permission_profile, role_id, roles(label)')
      .eq('is_active', true).order('full_name').then(({ data }) => setUsers(data || []))
  }, [open])

  if (!isSystemAdmin && !impersonating) return null
  if (variant === 'banner' && !impersonating) return null
  if (variant === 'trigger' && impersonating) return null

  const pick = async (u) => {
    await startImpersonation(u)
    setOpen(false)
    nav('/')
    toast(`צופה במערכת בתור ${u.full_name}`)
  }

  const stop = async () => {
    const realId = usePermissionStore.getState().realUserId
    await stopImpersonation(realId)
    nav('/')
    toast('חזרת לתצוגה שלך')
  }

  if (impersonating) {
    return (
      <div className="flex items-center gap-2 border-b bg-amber-100 px-4 py-1.5 text-amber-950 dark:bg-amber-950/60 dark:text-amber-100">
        <Eye className="size-4 shrink-0" />
        <span className="truncate text-sm">
          צופה במערכת בתור <b>{impersonating.full_name}</b> ({impersonating.roles?.label || '-'}).
          פעולות שתבצע נרשמות על שמך.
        </span>
        <Button size="sm" variant="outline" className="ms-auto h-7 bg-white/70 dark:bg-black/20" onClick={stop}>
          <X className="size-3.5" /> חזרה לתצוגה שלי
        </Button>
      </div>
    )
  }

  const filtered = users.filter(u => u.id !== rep?.id && (!q || u.full_name?.toLowerCase().includes(q.toLowerCase())))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="btn ghost sm" style={{ width: 36, padding: 0 }} title="צפייה בתור משתמש" aria-label="צפייה בתור משתמש">
          <Eye className="size-4" style={{ margin: '0 auto' }} />
        </button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader className="text-start">
          <DialogTitle>צפייה בתור משתמש</DialogTitle>
          <DialogDescription>
            המערכת תוצג בדיוק כפי שהמשתמש רואה אותה, לפי ההרשאות שלו. ההתחברות שלך לא משתנה.
          </DialogDescription>
        </DialogHeader>
        <Input placeholder="חיפוש משתמש" value={q} onChange={e => setQ(e.target.value)} />
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {filtered.map(u => (
            <button key={u.id} onClick={() => pick(u)}
              className="hover:bg-accent flex w-full items-center gap-3 rounded-md px-2 py-2 text-start transition-colors">
              <UserAvatar user={u} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{u.full_name}</span>
                <span className="text-muted-foreground block text-xs">{u.roles?.label || '-'}{u.department ? ` · ${u.department}` : ''}</span>
              </span>
            </button>
          ))}
          {!filtered.length && <p className="text-muted-foreground py-6 text-center text-sm">לא נמצאו משתמשים</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
