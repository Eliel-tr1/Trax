import { useMemo, useState } from 'react'
import PhoneInputBase, { getCountries, getCountryCallingCode, formatPhoneNumber, formatPhoneNumberIntl } from 'react-phone-number-input'
import en from 'react-phone-number-input/locale/en.json'
import flags from 'react-phone-number-input/flags'
import 'react-phone-number-input/style.css'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command'
import './PhoneInput.css'

// Global phone number field — replaces the old plain "+972 prefix" text
// display/input everywhere a phone number is shown or edited (customers,
// contacts, registration_passengers, ...). Built on react-phone-number-input
// (well-tested country/dial-code data + E.164 parsing) with a custom
// searchable country picker (flag + name, filterable by name or dial code)
// swapped in via its `countrySelectComponent` extension point, matching the
// shadcn/Radix Popover + Command primitives already used across the app.
// Defaults to Israel (🇮🇱 +972) when no country/value is set.
//
// `international` is toggled dynamically off the current value's detected
// country rather than passed as a static true/false: Israeli numbers get
// the natural local 05X... look (matches how the client actually reads a
// phone number), while any other country still shows the full +<code>
// international format the client asked to keep for non-Israeli numbers.
// The stored/emitted value is always E.164 either way — only the on-screen
// formatting changes.
export default function PhoneInput({ value, onChange, onBlur, disabled, readOnly, placeholder, className, autoFocus }) {
  const country = useCountryOf(value) || 'IL'
  return (
    <PhoneInputBase
      international={country !== 'IL'}
      autoFocus={autoFocus}
      defaultCountry="IL"
      countries={getCountries()}
      value={value || undefined}
      onChange={(v) => onChange?.(v || '')}
      onBlur={onBlur}
      disabled={disabled}
      readOnly={readOnly}
      placeholder={placeholder || 'מספר טלפון'}
      className={`phone-input ${className || ''}`}
      countrySelectComponent={CountrySelect}
      numberInputProps={{ className: 'input phone-input-number', dir: 'ltr' }}
    />
  )
}

// Read-only display: formatted, RTL-safe, with the flag alongside the
// number — used anywhere a phone is only shown (lists, activity cards).
// Israeli numbers (+972) render in natural local format (050-111-2223);
// every other country keeps the international +<code> format.
export function PhoneDisplay({ value }) {
  const country = useCountryOf(value)
  if (!value) return <span className="muted" style={{ fontWeight: 400 }}>-</span>
  const Flag = country && flags[country]
  const formatted = country === 'IL' ? (formatPhoneNumber(value) || value) : formatPhoneNumberIntl(value)
  return (
    <span dir="ltr" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {Flag && <span style={{ width: 16, borderRadius: 2, overflow: 'hidden', display: 'inline-flex' }}><Flag title={en[country] || country} /></span>}
      {formatted}
    </span>
  )
}

function useCountryOf(e164) {
  return useMemo(() => {
    if (!e164) return null
    for (const c of getCountries()) {
      try { if (e164.startsWith('+' + getCountryCallingCode(c))) return c } catch { /* skip */ }
    }
    return null
  }, [e164])
}

// Custom country <select> replacement: a flag-icon trigger button that
// opens a searchable (name OR dial-code) list, each row showing its flag
// next to the country name — react-phone-number-input calls this with
// {value, onChange, options, disabled, readOnly}.
function CountrySelect({ value, onChange, options, disabled, readOnly }) {
  const [open, setOpen] = useState(false)
  const countries = useMemo(
    () => options.filter(o => o.value && !o.divider).map(o => ({
      code: o.value,
      name: en[o.value] || o.value,
      dial: '+' + getCountryCallingCode(o.value),
    })),
    [options]
  )
  const current = countries.find(c => c.code === value)
  const Flag = current && flags[current.code]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="phone-country-trigger" disabled={disabled || readOnly} title={current?.name || 'בחר מדינה'}>
          {Flag ? <Flag title={current.name} /> : <span className="phone-flag-placeholder" />}
          <span className="phone-country-caret">▾</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="phone-country-popover p-0 w-64">
        <Command filter={(itemValue, search) => {
          const c = countries.find(x => x.code === itemValue)
          if (!c) return 0
          const q = search.trim().toLowerCase()
          if (!q) return 1
          return (c.name.toLowerCase().includes(q) || c.dial.includes(q)) ? 1 : 0
        }}>
          <CommandInput placeholder="חיפוש מדינה או קידומת..." />
          <CommandList>
            <CommandEmpty>לא נמצאו תוצאות</CommandEmpty>
            <CommandGroup>
              {countries.map(c => {
                const CFlag = flags[c.code]
                return (
                  <CommandItem key={c.code} value={c.code} onSelect={() => { onChange(c.code); setOpen(false) }}>
                    <span style={{ width: 18, display: 'inline-flex', flexShrink: 0 }}>{CFlag && <CFlag title={c.name} />}</span>
                    <span style={{ flex: 1 }}>{c.name}</span>
                    <span className="muted small" dir="ltr">{c.dial}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
