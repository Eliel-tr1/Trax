import { useBusinessUnitStore } from '../../stores/businessUnitStore'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

/* The single most important cross-cutting control in the app (see
   docs/architecture.md): switches the global business-unit filter applied
   to every list and every create-form default. Nothing in one unit may
   ever show data from the other. */
export default function BusinessUnitSwitcher() {
  const unit = useBusinessUnitStore(s => s.unit)
  const setUnit = useBusinessUnitStore(s => s.setUnit)
  return (
    <Select value={unit} onValueChange={setUnit}>
      <SelectTrigger className="h-9 w-28" aria-label="יחידה עסקית">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="TRAX">TRAX</SelectItem>
        <SelectItem value="Xcon">Xcon</SelectItem>
      </SelectContent>
    </Select>
  )
}
