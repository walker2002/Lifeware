'use client'

import { Button as ShadcnButton } from '@/components/ui/button'

interface CnuiButtonProps {
  label: string
  onClick: () => void
  variant?: 'default' | 'outline' | 'destructive' | 'ghost'
  disabled?: boolean
}

export function CnuiButton({ label, onClick, variant = 'default', disabled }: CnuiButtonProps) {
  return (
    <ShadcnButton variant={variant} onClick={onClick} disabled={disabled}>
      {label}
    </ShadcnButton>
  )
}
