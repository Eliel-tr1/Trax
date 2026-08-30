import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

/* One user, shown as their picture (or coloured initials) with the full name
   on hover.

   Used everywhere a user is referenced - list columns, activity feed, record
   fields - so a table of twenty rows reads as twenty faces instead of twenty
   repeated text names. The hue is stored per user, so the same person is
   always the same colour across the whole app. */

export const initialsOf = (name = '') =>
  (name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('') || '?'

const SIZES = { xs: 'size-5 text-[0.55rem]', sm: 'size-6 text-[0.6rem]', md: 'size-8 text-xs', lg: 'size-10 text-sm' }

export default function UserAvatar({ user, name, size = 'sm', showName = false, className = '' }) {
  const label = user?.full_name || name || ''
  if (!label && !user?.avatar_url) return <span className="text-muted-foreground">-</span>

  const hue = user?.avatar_hue ?? 270
  const avatar = (
    <Avatar className={`${SIZES[size] || SIZES.sm} shrink-0 ${className}`}>
      {user?.avatar_url && <AvatarImage src={user.avatar_url} alt={label} />}
      <AvatarFallback
        className="font-semibold"
        style={{ background: `hsl(${hue} 62% 88%)`, color: `hsl(${hue} 70% 28%)` }}>
        {initialsOf(label)}
      </AvatarFallback>
    </Avatar>
  )

  if (showName) {
    return (
      <span className="inline-flex min-w-0 items-center gap-2">
        {avatar}
        <span className="truncate">{label}</span>
      </span>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-default">{avatar}</span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/* Several users side by side, overlapping, with a +N chip past the limit. */
export function UserAvatarGroup({ users = [], max = 3, size = 'sm' }) {
  const shown = users.slice(0, max)
  const rest = users.length - shown.length
  if (!users.length) return <span className="text-muted-foreground">-</span>
  return (
    <span className="flex items-center -space-x-2 space-x-reverse">
      {shown.map((u, i) => (
        <span key={u.id || i} className="ring-background rounded-full ring-2">
          <UserAvatar user={u} size={size} />
        </span>
      ))}
      {rest > 0 && (
        <span className="bg-muted text-muted-foreground ring-background flex size-6 items-center justify-center rounded-full text-[0.6rem] font-semibold ring-2">
          +{rest}
        </span>
      )}
    </span>
  )
}
