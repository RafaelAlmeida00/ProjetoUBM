'use client'

/**
 * T-O3.8 — Componente UbmTabs (.ubm-tabs)
 * WAI-ARIA tabs: role="tablist"/"tab"/"tabpanel", setas navegam, aria-selected, aria-controls.
 * design.md §4 — aba ativa com linha marsala, troca fade+slide.
 */

import React, { useState, useRef, useCallback } from 'react'

export interface UbmTab {
  id: string
  label: string
  content: React.ReactNode
}

export interface UbmTabsProps {
  tabs: UbmTab[]
  defaultTab?: string
  'aria-label'?: string
}

export function UbmTabs({ tabs, defaultTab, 'aria-label': ariaLabel }: UbmTabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0]?.id ?? '')
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, idx: number) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        const next = (idx + 1) % tabs.length
        tabRefs.current[next]?.focus()
        setActiveTab(tabs[next].id)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        const prev = (idx - 1 + tabs.length) % tabs.length
        tabRefs.current[prev]?.focus()
        setActiveTab(tabs[prev].id)
      } else if (e.key === 'Home') {
        e.preventDefault()
        tabRefs.current[0]?.focus()
        setActiveTab(tabs[0].id)
      } else if (e.key === 'End') {
        e.preventDefault()
        const last = tabs.length - 1
        tabRefs.current[last]?.focus()
        setActiveTab(tabs[last].id)
      }
    },
    [tabs],
  )

  const activePanel = tabs.find((t) => t.id === activeTab)

  return (
    <div className="ubm-tabs">
      <div
        role="tablist"
        className="ubm-tabs-list"
        aria-label={ariaLabel}
      >
        {tabs.map((tab, idx) => {
          const isActive = tab.id === activeTab
          return (
            <button
              key={tab.id}
              id={`ubm-tab-${tab.id}`}
              ref={(el) => { tabRefs.current[idx] = el }}
              role="tab"
              aria-selected={isActive}
              aria-controls={`ubm-tabpanel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              className={`ubm-tabs-tab${isActive ? ' ubm-tabs-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {activePanel && (
        <div
          id={`ubm-tabpanel-${activePanel.id}`}
          role="tabpanel"
          aria-labelledby={`ubm-tab-${activePanel.id}`}
          className="ubm-tabs-panel"
          tabIndex={0}
        >
          {activePanel.content}
        </div>
      )}
    </div>
  )
}
