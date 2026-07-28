import * as React from "react"

import { Button, buttonVariants } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { VariantProps } from "class-variance-authority"

interface IconButtonProps
  extends React.ComponentProps<typeof Button>,
    VariantProps<typeof buttonVariants> {
  tooltip: string
  tooltipSide?: "top" | "right" | "bottom" | "left"
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ tooltip, tooltipSide = "top", variant = "ghost", size = "icon", ...props }, ref) => {
    return (
      <Tooltip>
        <TooltipTrigger
          ref={ref}
          render={<Button variant={variant} size={size} {...props} />}
        />
        <TooltipContent side={tooltipSide}>{tooltip}</TooltipContent>
      </Tooltip>
    )
  }
)
IconButton.displayName = "IconButton"

/**
 * Wraps a trigger element (e.g. a Dialog's own `trigger` prop) with a tooltip via a plain
 * `<span>` anchor instead of merging onto the trigger's own button — merging two base-ui
 * "render prop" primitives (Tooltip + Dialog trigger) onto the same node silently drops the
 * tooltip's hover registration, so the tooltip must anchor to a separate wrapping element.
 */
function TooltipWrap({
  tooltip,
  tooltipSide = "top",
  children,
}: {
  tooltip: string
  tooltipSide?: "top" | "right" | "bottom" | "left"
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>{children}</TooltipTrigger>
      <TooltipContent side={tooltipSide}>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

export { IconButton, TooltipWrap }
