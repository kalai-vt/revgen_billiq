import * as React from "react"
import { Input } from "@/components/ui/input"

export interface NumericInputProps
  extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "defaultValue" | "type" | "min" | "max" | "onEnter"> {
  /** Current numeric value. `null` renders an empty field. */
  value: number | null
  /** Fires with the parsed number (or `null` when `required` is false and the field is left empty). */
  onChange: (value: number | null) => void
  /** Minimum allowed value. Defaults to 0 — pass a negative number to allow negatives. */
  min?: number
  /** Maximum allowed value. Unbounded by default. */
  max?: number
  /** Whether decimal input is allowed. Set false for whole-number-only fields like Quantity. */
  allowDecimal?: boolean
  /** Decimal places to round to on commit. */
  decimalPlaces?: number
  /** Value committed on blur when the field is left empty and `required` is true. */
  defaultValue?: number
  /** When false, leaving the field empty on blur commits `null` instead of `defaultValue`. */
  required?: boolean
  /**
   * `"change"` (default) fires `onChange` live on every keystroke that parses to a valid
   * number — needed for fields that drive a live total preview. `"blur"` only fires on
   * blur/Enter, for fields with their own commit-time side effects (e.g. a confirm prompt).
   */
  commitOn?: "change" | "blur"
  /** Called after Enter commits the value, before the input blurs — e.g. to move focus on. */
  onEnter?: () => void
  /** Show an inline message below the input when a committed value gets clamped to min/max. */
  showValidation?: boolean
}

function round(value: number, decimalPlaces: number): number {
  const factor = 10 ** decimalPlaces
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function formatValue(value: number | null, decimalPlaces: number, allowDecimal: boolean): string {
  if (value === null || Number.isNaN(value)) return ""
  return String(allowDecimal ? round(value, decimalPlaces) : Math.round(value))
}

export const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(function NumericInput(
  {
    value,
    onChange,
    min = 0,
    max,
    allowDecimal = true,
    decimalPlaces = 2,
    defaultValue = 0,
    required = true,
    commitOn = "change",
    onEnter,
    showValidation = true,
    className,
    onFocus,
    onBlur,
    onKeyDown,
    ...props
  },
  forwardedRef,
) {
  const innerRef = React.useRef<HTMLInputElement>(null)
  React.useImperativeHandle(forwardedRef, () => innerRef.current as HTMLInputElement)

  const [text, setText] = React.useState(() => formatValue(value, decimalPlaces, allowDecimal))
  const [focused, setFocused] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!focused) setText(formatValue(value, decimalPlaces, allowDecimal))
  }, [value, focused, decimalPlaces, allowDecimal])

  const allowNegative = min < 0
  const inProgressPattern = React.useMemo(() => {
    if (allowDecimal) return allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/
    return allowNegative ? /^-?\d*$/ : /^\d*$/
  }, [allowDecimal, allowNegative])

  function commit(rawText: string) {
    const trimmed = rawText.trim()
    if (trimmed === "" || trimmed === "-" || trimmed === ".") {
      if (required) {
        setText(formatValue(defaultValue, decimalPlaces, allowDecimal))
        setError(null)
        onChange(defaultValue)
      } else {
        setText("")
        setError(null)
        onChange(null)
      }
      return
    }

    const numeric = Number(trimmed)
    if (Number.isNaN(numeric)) {
      setText(formatValue(value, decimalPlaces, allowDecimal))
      return
    }

    let clamped = numeric
    let message: string | null = null
    if (min !== undefined && clamped < min) {
      clamped = min
      message = `Must be at least ${min}`
    } else if (max !== undefined && clamped > max) {
      clamped = max
      message = `Must be at most ${max}`
    }
    clamped = allowDecimal ? round(clamped, decimalPlaces) : Math.round(clamped)

    setText(formatValue(clamped, decimalPlaces, allowDecimal))
    setError(showValidation ? message : null)
    onChange(clamped)
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value
    if (!inProgressPattern.test(raw)) {
      // The browser already applied this keystroke to the DOM before onChange
      // fired; since React only re-renders on a state change, an early return
      // here would leave the invalid character visible. Reset the DOM node
      // directly so a rejected keystroke never sticks, and re-select the text
      // so a rejected first keystroke (e.g. "-" when negatives are disallowed)
      // doesn't cause the *next* valid keystroke to append instead of replace.
      event.target.value = text
      event.target.setSelectionRange(0, text.length)
      return
    }
    setText(raw)
    if (error) setError(null)

    if (commitOn === "change" && raw !== "" && raw !== "-" && raw !== ".") {
      const parsed = Number(raw)
      if (!Number.isNaN(parsed)) onChange(parsed)
    }
  }

  function handleFocus(event: React.FocusEvent<HTMLInputElement>) {
    setFocused(true)
    event.target.select()
    onFocus?.(event)
  }

  function handleBlur(event: React.FocusEvent<HTMLInputElement>) {
    setFocused(false)
    commit(text)
    onBlur?.(event)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault()
      commit(text)
      onEnter?.()
      innerRef.current?.blur()
    }
    onKeyDown?.(event)
  }

  return (
    <div className="relative">
      <Input
        ref={innerRef}
        type="text"
        inputMode={allowDecimal ? "decimal" : "numeric"}
        value={text}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={className}
        {...props}
      />
      {error && (
        <p className="absolute left-0 top-full z-10 mt-1 whitespace-nowrap text-xs text-destructive">{error}</p>
      )}
    </div>
  )
})
