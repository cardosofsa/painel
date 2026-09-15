import type { ReactNode } from 'react'

export function Card({
  title,
  subtitle,
  icon,
  right,
  children,
  className = '',
}: {
  title?: string
  subtitle?: string
  icon?: ReactNode
  right?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900 dark:shadow-none ${className}`}
    >
      {(title || right) && (
        <div className="flex items-start justify-between gap-3 px-5 pb-0 pt-5">
          <div className="flex items-start gap-3">
            {icon && (
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
                {icon}
              </div>
            )}
            <div>
              {title && <h3 className="text-[13px] font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h3>}
              {subtitle && <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">{subtitle}</p>}
            </div>
          </div>
          {right}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}
