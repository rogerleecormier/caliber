import type { ReactNode } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@caliber/ui-kit"

interface DrillDownDialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl"
}

const maxWidthClass = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
}

export function DrillDownDialog({
  open,
  onClose,
  title,
  description,
  children,
  maxWidth = "3xl",
}: DrillDownDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={`${maxWidthClass[maxWidth]} w-full max-h-[85vh] flex flex-col p-0 gap-0`}>
        <DialogHeader className="px-6 py-4 border-b border-slate-100 shrink-0">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 jobs-modal-scroll">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  )
}
