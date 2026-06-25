'use client'

import { createContext, useContext, useState, useCallback, useId, type KeyboardEvent } from 'react'

// ── Context ──────────────────────────────────────────────────────────────────

interface TabsContextValue {
  activeTab: string
  setActiveTab: (id: string) => void
  baseId: string
}

const TabsContext = createContext<TabsContextValue | null>(null)

function useTabsContext(): TabsContextValue {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('Tabs subcomponents must be used inside <Tabs>')
  return ctx
}

// ── Tabs (root container) ─────────────────────────────────────────────────────

interface TabsProps {
  /** Tab id that should be active initially. */
  defaultTab: string
  /** Controlled active tab (overrides internal state). */
  activeTab?: string
  /** Called when the user changes the active tab. */
  onTabChange?: (id: string) => void
  children: React.ReactNode
  className?: string
}

export function Tabs({ defaultTab, activeTab: controlledTab, onTabChange, children, className }: TabsProps) {
  const [internalTab, setInternalTab] = useState(defaultTab)
  const baseId = useId()

  const activeTab = controlledTab ?? internalTab
  const setActiveTab = useCallback(
    (id: string) => {
      setInternalTab(id)
      onTabChange?.(id)
    },
    [onTabChange],
  )

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab, baseId }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

// ── TabList ───────────────────────────────────────────────────────────────────

export interface TabItem {
  id: string
  label: string
}

interface TabListProps {
  tabs: TabItem[]
  className?: string
}

export function TabList({ tabs, className }: TabListProps) {
  const { activeTab, setActiveTab, baseId } = useTabsContext()

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex: number | null = null

    if (e.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabs.length
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
    } else if (e.key === 'Home') {
      nextIndex = 0
    } else if (e.key === 'End') {
      nextIndex = tabs.length - 1
    }

    if (nextIndex !== null) {
      e.preventDefault()
      setActiveTab(tabs[nextIndex].id)
      const tabEl = document.getElementById(`${baseId}-tab-${tabs[nextIndex].id}`)
      tabEl?.focus()
    }
  }

  return (
    <div
      role="tablist"
      className={[
        'flex gap-1 border-b border-[var(--color-border)] overflow-x-auto',
        className ?? '',
      ].join(' ')}
    >
      {tabs.map((tab, index) => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            id={`${baseId}-tab-${tab.id}`}
            role="tab"
            aria-selected={isActive}
            aria-controls={`${baseId}-panel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={[
              'px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-interactive)] focus-visible:ring-offset-0',
              isActive
                ? 'border-[var(--color-interactive)] text-[var(--color-interactive)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)]',
            ].join(' ')}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

// ── TabPanel ──────────────────────────────────────────────────────────────────

interface TabPanelProps {
  id: string
  children: React.ReactNode
  className?: string
}

/**
 * Inactive panels are hidden with Tailwind `hidden` (display:none) only —
 * no `hidden` attribute, no `aria-hidden` — so that form fields within
 * inactive panels remain discoverable by react-hook-form register() and
 * @testing-library getByLabelText queries.
 */
export function TabPanel({ id, children, className }: TabPanelProps) {
  const { activeTab, baseId } = useTabsContext()
  const isActive = activeTab === id

  return (
    <div
      id={`${baseId}-panel-${id}`}
      role="tabpanel"
      aria-labelledby={`${baseId}-tab-${id}`}
      tabIndex={0}
      className={[
        'focus:outline-none',
        className ?? '',
        isActive ? '' : 'hidden',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
}
