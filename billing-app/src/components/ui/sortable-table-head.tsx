import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import { TableHead } from "@/components/ui/table"
import { cn } from "@/lib/utils"

interface SortableTableHeadProps<T extends string> {
  field: T
  sortBy: T
  sortDir: "asc" | "desc"
  onSort: (field: T) => void
  className?: string
  children: React.ReactNode
}

function SortableTableHead<T extends string>({
  field,
  sortBy,
  sortDir,
  onSort,
  className,
  children,
}: SortableTableHeadProps<T>) {
  const isActive = sortBy === field
  const Icon = isActive ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown

  return (
    <TableHead
      className={cn("relative p-0", className)}
      aria-sort={isActive ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className="flex h-10 w-full items-center gap-1 px-2 text-left font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        {children}
        <Icon className={cn("size-3.5 shrink-0", isActive ? "text-foreground" : "text-muted-foreground/50")} />
      </button>
    </TableHead>
  )
}

export { SortableTableHead }
