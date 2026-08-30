import { useRef, useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Alert, AlertDescription } from '../components/ui/alert'
import Icon from '../components/Icon'

export default function LoginPage() {
  const { signIn, error } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)

  const doLogin = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try { await signIn(email, password) } catch { /* error surfaced via store */ }
    finally { inFlight.current = false; setBusy(false) }
  }
  const submit = (e) => { e.preventDefault(); doLogin() }

  return (
    <div className="center-screen">
      <Card className="w-full max-w-sm shadow-2xl">
        <CardContent className="pt-2">
          <div className="mb-6 flex flex-col items-center gap-2">
            <div className="text-2xl font-bold">TRAX CRM</div>
            <p className="text-muted-foreground text-sm">מועדון טיולי TRAX · Xcon</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">כתובת מייל</Label>
              <Input id="email" type="email" dir="ltr" autoFocus value={email} onChange={e => setEmail(e.target.value)}
                placeholder="name@trax-crm.test" autoComplete="username" required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">סיסמה</Label>
              <div className="relative">
                <Input id="password" className="pe-10" type={showPass ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
                <Button type="button" variant="ghost" size="icon"
                  className="text-muted-foreground absolute end-1 top-1/2 size-8 -translate-y-1/2"
                  onClick={() => setShowPass(s => !s)}
                  title={showPass ? 'הסתר סיסמה' : 'הצג סיסמה'}
                  aria-label={showPass ? 'הסתר סיסמה' : 'הצג סיסמה'}>
                  <Icon name={showPass ? 'eye-off' : 'eye'} size={18} />
                </Button>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={busy} onClick={doLogin}>
              {busy ? <span className="spinner light" style={{ width: 18, height: 18 }} /> : 'התחברות'}
            </Button>
          </form>

          <p className="text-muted-foreground mt-5 text-center text-xs">גישה לצוות TRAX בלבד</p>
        </CardContent>
      </Card>
    </div>
  )
}
