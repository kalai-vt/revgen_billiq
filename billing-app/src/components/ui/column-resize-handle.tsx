import { cn } from "@/lib/utils"

interface ColumnResizeHandleProps {
  onPointerDown: (event: React.PointerEvent) => void
  className?: string
}

function ColumnResizeHandle({ onPointerDown, className }: ColumnResizeHandleProps) {
  return (
    <div
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation="vertical"
      className={cn(
        "absolute top-0 right-0 z-20 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-primary/40 active:bg-primary/60",
        className,
      )}
    />
  )
}

export { ColumnResizeHandle }
