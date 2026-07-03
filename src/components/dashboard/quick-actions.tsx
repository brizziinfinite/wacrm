"use client"

import Link from 'next/link'
import { UserPlus, Briefcase, Radio, Zap } from 'lucide-react'
import type { ComponentType } from 'react'
import { GlowCard } from '@/components/ui/glow-card'

// Quick-action shortcuts. Each navigates to the page that owns the
// relevant "create" flow. We deliberately don't try to auto-open any
// modal on the target page — that'd require touching those pages,
// which is out of scope here.
interface Action {
  label: string
  href: string
  icon: ComponentType<{ className?: string }>
  tint: string
}

const ACTIONS: Action[] = [
  { label: 'New Contact', href: '/contacts', icon: UserPlus, tint: 'text-primary' },
  { label: 'New Deal', href: '/pipelines', icon: Briefcase, tint: 'text-blue-400' },
  { label: 'New Broadcast', href: '/broadcasts/new', icon: Radio, tint: 'text-amber-400' },
  { label: 'New Automation', href: '/automations/new', icon: Zap, tint: 'text-primary' },
]

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {ACTIONS.map((a) => {
        const Icon = a.icon
        return (
          <GlowCard
            key={a.href}
            className="rounded-xl border border-white/[0.07] bg-card"
          >
            <Link
              href={a.href}
              className="flex items-center gap-3 px-4 py-3"
            >
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] ${a.tint}`}>
                <Icon className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-foreground">{a.label}</span>
            </Link>
          </GlowCard>
        )
      })}
    </div>
  )
}
