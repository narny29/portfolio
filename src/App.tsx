'use client'

import { useState } from 'react'
import DesktopLayout from './components/layout/DesktopLayout'
import MobileLayout from './components/layout/MobileLayout'
import { useMediaQuery } from './hooks/useMediaQuery'

export default function App() {
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null)
  const [currentFolder, setCurrentFolder] = useState('inbox')
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  return (
    <main className="h-screen overflow-hidden">
      {isDesktop ? (
        <DesktopLayout
          selectedEmail={selectedEmail}
          setSelectedEmail={setSelectedEmail}
          currentFolder={currentFolder}
          setCurrentFolder={setCurrentFolder}
        />
      ) : (
        <MobileLayout
          selectedEmail={selectedEmail}
          setSelectedEmail={setSelectedEmail}
          currentFolder={currentFolder}
          setCurrentFolder={setCurrentFolder}
        />
      )}
    </main>
  )
} 