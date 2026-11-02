import { Link, type ErrorComponentProps } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  )
}

export function PageSpinner() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner />
    </div>
  )
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-app p-10 text-center">
      {icon}
      <p className="font-medium">{title}</p>
      {children ? <div className="max-w-md text-sm text-muted">{children}</div> : null}
    </div>
  )
}

export function RouteError({ error, reset }: ErrorComponentProps) {
  return (
    <div className="mx-auto max-w-xl py-16">
      <EmptyState title="Something went wrong">
        <p className="mb-4 font-mono text-xs break-all">{error instanceof Error ? error.message : String(error)}</p>
        <button className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm text-white" onClick={reset}>
          Try again
        </button>
      </EmptyState>
    </div>
  )
}

export function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-16">
      <EmptyState title="Page not found">
        <Link to="/" className="text-accent-600 underline">
          Back to home
        </Link>
      </EmptyState>
    </div>
  )
}
