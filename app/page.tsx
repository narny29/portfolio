'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { 
  Bars3Icon,
  StarIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  CalendarIcon
} from '@heroicons/react/24/outline'
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid'
import { folders } from '@/lib/data'
import { 
  toggleItemSelection, 
  selectAllItems, 
  deselectAllItems, 
  toggleStar, 
  toggleAllStars, 
  markAsRead,
  loadPortfolioData,
  formatDate
} from '@/lib/utils'
import { PortfolioItem, PortfolioData, ScheduleCallRequest } from '@/lib/types'

export default function Home() {
  const [currentFolder, setCurrentFolder] = useState('experiences')
  const [showSidebar, setShowSidebar] = useState(false)
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [portfolioData, setPortfolioData] = useState<PortfolioData>({})
  const [currentItems, setCurrentItems] = useState<PortfolioItem[]>([])
  const [showProfilePopup, setShowProfilePopup] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showCalendar, setShowCalendar] = useState(false)
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [calendarViewMonth, setCalendarViewMonth] = useState(new Date())
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [selectedItem, setSelectedItem] = useState<PortfolioItem | null>(null)
  const [showEmailDetail, setShowEmailDetail] = useState(false)
  const [showComposeWidget, setShowComposeWidget] = useState(false)
  const [composeFormData, setComposeFormData] = useState({
    email: '',
    date: '',
    time: '',
    subject: '',
    body: ''
  })
  const [sessionExpired, setSessionExpired] = useState(false)
  const [sessionRefreshing, setSessionRefreshing] = useState(false)
  const [composeError, setComposeError] = useState('')
  const [composeCooldown, setComposeCooldown] = useState(0)
  const sessionTokenRef = useRef<string | null>(null)

  // Reset all state to initial values
  const resetState = () => {
    setPortfolioData({})
    setCurrentItems([])
    setSelectedItems([])
    setSearchQuery('')
  }

  // Session token for the email/scheduling APIs; issued per page load by
  // /api/session (max 250 active tokens, FIFO eviction — see lib/session.ts)
  const fetchSessionToken = useCallback(async () => {
    setSessionRefreshing(true)
    try {
      const response = await fetch('/api/session')
      if (response.ok) {
        const data = await response.json()
        sessionTokenRef.current = data.token
        setSessionExpired(false)
      }
    } catch {
      // Network failure — keep any existing token; API errors will surface it
    } finally {
      setSessionRefreshing(false)
    }
  }, [])

  const startComposeCooldown = useCallback((seconds: number) => {
    setComposeCooldown(seconds)
  }, [])

  // Count the cooldown down to 0 once per second, then clear the error line
  useEffect(() => {
    if (composeCooldown <= 0) {
      setComposeError('')
      return
    }
    const timer = setInterval(() => {
      setComposeCooldown(prev => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [composeCooldown])

  // Load initial data (all folders) on component mount
  useEffect(() => {
    // Load all folder data on initial mount for better UX
    const loadAllFolders = async () => {
      setLoading(true)
      try {
        const folderPromises = folders.map(folder => loadPortfolioData(folder.id))
        const results = await Promise.all(folderPromises)
        
        // Process all data and update state
        const allData: PortfolioData = {}
        results.forEach((data, index) => {
          const folderId = folders[index].id
          const freshData = data.map(item => ({
            ...item,
            starred: folderId === 'contact' ? false : (item.starred === true), // Contact items never start starred
            read: folderId === 'contact' ? false : (item.read === true)        // Contact items never start read
          }))
          allData[folderId as keyof PortfolioData] = freshData
        })
        
        setPortfolioData(allData)
        setCurrentItems(allData.experiences || [])
      } catch (error) {
        console.error('Error loading initial data:', error)
        // Fallback to just loading experiences
        loadFolderData('experiences')
      } finally {
        setLoading(false)
      }
    }
    
    loadAllFolders()
    fetchSessionToken()
  }, []) // Empty dependency array - only run once on mount

  // Filter items based on search query
  const filteredItems = currentItems.filter(item =>
    item.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.preview.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Load data when folder changes
  const loadFolderData = async (folder: string) => {
    // If data is already loaded, use it immediately
    if (portfolioData[folder as keyof PortfolioData]) {
      setCurrentItems(portfolioData[folder as keyof PortfolioData] || [])
      return
    }

    // This should rarely happen now, but keep as fallback
    setLoading(true)
    try {
      const data = await loadPortfolioData(folder)
      
      // Ensure we're working with fresh data from JSON, explicitly handling boolean values
      // For contact folder, always reset to fresh state
      const freshData = data.map(item => ({
        ...item,
        starred: folder === 'contact' ? false : (item.starred === true), // Contact items never start starred
        read: folder === 'contact' ? false : (item.read === true)        // Contact items never start read
      }))
      
      setPortfolioData(prev => ({ ...prev, [folder]: freshData }))
      setCurrentItems(freshData)
    } catch (error) {
      console.error(`Error loading ${folder}:`, error)
      setCurrentItems([])
    } finally {
      setLoading(false)
    }
  }

  const handleFolderChange = (folder: string) => {
    // Immediate state update for smooth UI transition
    setCurrentFolder(folder)
    setSelectedItems([]) // Clear selection when changing folders
    
    // Load data if not already cached
    if (portfolioData[folder as keyof PortfolioData]) {
      setCurrentItems(portfolioData[folder as keyof PortfolioData] || [])
    } else {
      loadFolderData(folder)
    }
  }

  const handleItemSelection = (itemId: string) => {
    setSelectedItems(prev => {
      if (prev.includes(itemId)) {
        // Remove from selection
        return prev.filter(id => id !== itemId)
      } else {
        // Add to selection
        return [...prev, itemId]
      }
    })
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      // Two-phase cascading select all effect - only animate unselected items
      const unselectedItems = filteredItems.filter(item => !selectedItems.includes(item.id))
      unselectedItems.forEach((item, index) => {
        // Phase 1: Visual feedback (color change) - 150ms
        setTimeout(() => {
          // Add animation class for visual feedback
          const rowElement = document.querySelector(`[data-item-id="${item.id}"]`)
          if (rowElement) {
            rowElement.classList.add('gmail-cascading-select')
          }
        }, index * 150)
        
        // Phase 2: Actual selection with gap - 100ms after visual feedback
        setTimeout(() => {
          setSelectedItems(prev => {
            if (!prev.includes(item.id)) {
              return [...prev, item.id]
            }
            return prev
          })
          
          // Remove animation class after selection
          const rowElement = document.querySelector(`[data-item-id="${item.id}"]`)
          if (rowElement) {
            setTimeout(() => {
              rowElement.classList.remove('gmail-cascading-select')
            }, 300)
          }
        }, (index * 150) + 100)
      })
    } else {
      // Deselect all - always go from top to bottom for consistency
      const allItemIds = filteredItems.map(item => item.id) // Use filtered items order (top to bottom)
      const currentlySelected = allItemIds.filter(id => selectedItems.includes(id)) // Only animate currently selected
      
      currentlySelected.forEach((itemId, index) => {
        // Phase 1: Visual feedback (color change) - 150ms
        setTimeout(() => {
          const rowElement = document.querySelector(`[data-item-id="${itemId}"]`)
          if (rowElement) {
            rowElement.classList.add('gmail-cascading-select')
          }
        }, index * 150)
        
        // Phase 2: Actual deselection with gap - 100ms after visual feedback
        setTimeout(() => {
          setSelectedItems(prev => prev.filter(id => id !== itemId))
          
          // Remove animation class after deselection
          const rowElement = document.querySelector(`[data-item-id="${itemId}"]`)
          if (rowElement) {
            setTimeout(() => {
              rowElement.classList.remove('gmail-cascading-select')
            }, 300)
          }
        }, (index * 150) + 100)
      })
    }
  }

  const handleStarAll = () => {
    const allStarred = filteredItems.every(item => item.starred)
    const updatedItems = [...currentItems]
    
    // Two-phase cascading star all effect - only animate items that need starring/unstarring
    const itemsToToggle = filteredItems.filter(item => item.starred !== !allStarred)
    itemsToToggle.forEach((item, index) => {
      // Phase 1: Visual feedback (color change) - 150ms
      setTimeout(() => {
        // Add animation class for visual feedback
        const rowElement = document.querySelector(`[data-item-id="${item.id}"]`)
        if (rowElement) {
          rowElement.classList.add('gmail-cascading-star')
        }
      }, index * 150)
      
      // Phase 2: Actual starring with gap - 100ms after visual feedback
      setTimeout(() => {
        const itemIndex = updatedItems.findIndex(updatedItem => updatedItem.id === item.id)
        if (itemIndex !== -1) {
          updatedItems[itemIndex] = { ...updatedItems[itemIndex], starred: !allStarred }
          setCurrentItems([...updatedItems])
          // Update the portfolio data as well
          setPortfolioData(prev => ({
            ...prev,
            [currentFolder]: updatedItems
          }))
          
          // Add pop effect to the star icon
          const rowElement = document.querySelector(`[data-item-id="${item.id}"]`)
          if (rowElement) {
            const starButton = rowElement.querySelector('.gmail-star-btn')
            if (starButton) {
              // Add pop-up or pop-down effect based on action
              if (!allStarred) {
                // Starring - pop up effect
                starButton.classList.add('gmail-star-pop-up')
                setTimeout(() => {
                  starButton.classList.remove('gmail-star-pop-up')
                }, 300)
              } else {
                // Unstarring - pop down effect
                starButton.classList.add('gmail-star-pop-down')
                setTimeout(() => {
                  starButton.classList.remove('gmail-star-pop-down')
                }, 300)
              }
            }
          }
          
          // Remove animation class after starring
          if (rowElement) {
            setTimeout(() => {
              rowElement.classList.remove('gmail-cascading-star')
            }, 300)
          }
        }
      }, (index * 150) + 100)
    })
  }

  const handleStarToggle = (itemId: string) => {
    const updatedItems = currentItems.map(item =>
      item.id === itemId ? { ...item, starred: !item.starred } : item
    )
    setCurrentItems(updatedItems)
    // Update the portfolio data as well
    setPortfolioData(prev => ({
      ...prev,
      [currentFolder]: updatedItems
    }))
    
    // Add pop effect to the star icon
    const rowElement = document.querySelector(`[data-item-id="${itemId}"]`)
    if (rowElement) {
      const starButton = rowElement.querySelector('.gmail-star-btn')
      if (starButton) {
        const currentItem = currentItems.find(item => item.id === itemId)
        if (currentItem) {
          // Add pop-up or pop-down effect based on action
          if (!currentItem.starred) {
            // Starring - pop up effect
            starButton.classList.add('gmail-star-pop-up')
            setTimeout(() => {
              starButton.classList.remove('gmail-star-pop-up')
            }, 300)
          } else {
            // Unstarring - pop down effect
            starButton.classList.add('gmail-star-pop-down')
            setTimeout(() => {
              starButton.classList.remove('gmail-star-pop-down')
            }, 300)
          }
        }
      }
    }
  }

  // Check if all items are starred
  const allItemsStarred = filteredItems.length > 0 && filteredItems.every(item => item.starred)

  // Handle time slot selection
  const handleTimeSlotClick = (time: string) => {
    setSelectedTimeSlot(selectedTimeSlot === time ? null : time)
    console.log(`Selected time slot: ${time}`)
  }

  // Handle date selection
  const handleDateSelect = (date: Date) => {
    setSelectedDate(date)
    setCalendarViewMonth(new Date(date.getFullYear(), date.getMonth(), 1))
    setShowDatePicker(false)
  }

  // Handle today button click
  const handleTodayClick = () => {
    const today = new Date()
    setSelectedDate(today)
    setCalendarViewMonth(new Date(today.getFullYear(), today.getMonth(), 1))
  }

  // Check if selected date is today
  const isToday = (date: Date) => {
    const today = new Date()
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear()
  }

  // Format date for display
  const formatDisplayDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  // Handle schedule call
  const handleScheduleCall = async () => {
    if (!selectedDate || !selectedTimeSlot) {
      alert("Please select a date and time first");
      return;
    }

    try {
      const response = await fetch('/api/schedule-call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-portfolio-token': sessionTokenRef.current || '',
        },
        body: JSON.stringify({
          requestedDate: selectedDate.toISOString().split('T')[0],
          requestedTime: selectedTimeSlot,
          requestedDateTime: new Date(`${selectedDate.toISOString().split('T')[0]}T${selectedTimeSlot}:00`).toISOString()
        })
      });

      if (response.ok) {
        alert('✅ Schedule request sent! I\'ll get back to you soon.');
        // Reset selection
        setSelectedTimeSlot(null);
      } else {
        const result = await response.json().catch(() => null)
        if (result?.code === 'TOKEN_INVALID') {
          // Refresh just the token — no page reload needed
          await fetchSessionToken()
          alert('Your session was refreshed — please try again.')
        } else {
          alert('❌ Error sending request. Please try again.');
        }
      }
    } catch (error) {
      console.error('Error:', error);
      alert('❌ Error sending request. Please try again.');
    }
  };

  // Compute dynamic folder counts
  const getFolderCounts = (folderId: string) => {
    const data = portfolioData[folderId as keyof PortfolioData] || []
    return {
      count: data.length,
      unread: data.filter(item => !item.read).length
    }
  }

  const handleItemClick = (itemId: string) => {
    // Find the full item data
    const item = currentItems.find(item => item.id === itemId)
    if (item) {
      setSelectedItem(item)
      setShowEmailDetail(true)
      // Mark as read
      markAsRead(itemId, currentItems, setCurrentItems)
      // Update the portfolio data as well
      setPortfolioData(prev => ({
        ...prev,
        [currentFolder]: currentItems.map(item =>
          item.id === itemId ? { ...item, read: true } : item
        )
      }))
    }
  }

  const handleCheckboxClick = (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation()
    handleItemSelection(itemId)
  }

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>, itemId: string) => {
    e.stopPropagation()
    handleItemSelection(itemId)
  }

  // Handle compose widget
  const handleComposeClick = () => {
    setShowComposeWidget(true)
    // Reset form data
    setComposeFormData({
      email: '',
      date: '',
      time: '',
      subject: '',
      body: ''
    })
  }

  const handleCalendarSlotClick = (time: string) => {
    setSelectedTimeSlot(selectedTimeSlot === time ? null : time)
    console.log(`Selected time slot: ${time}`)
    
    // Open compose widget and auto-fill date and time
    setShowComposeWidget(true)
    setComposeFormData(prev => ({
      ...prev,
      date: selectedDate.toISOString().split('T')[0],
      time: time
    }))
  }

  const handleComposeFormChange = (field: string, value: string) => {
    setComposeFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleComposeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (composeCooldown > 0) return

    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-portfolio-token': sessionTokenRef.current || '',
        },
        body: JSON.stringify(composeFormData),
      })

      const result = await response.json()

      if (response.ok) {
        setComposeError('')
        setSessionExpired(false)
        alert('✅ Email sent successfully! I\'ll get back to you soon.')
        setShowComposeWidget(false)
        setComposeFormData({
          email: '',
          date: '',
          time: '',
          subject: '',
          body: ''
        })
      } else if (result.code === 'TOKEN_INVALID') {
        setSessionExpired(true)
        setComposeError('Your session expired — the site was busy. Refresh your token below and try again.')
      } else if (response.status === 429 && typeof result.retryAfterSeconds === 'number') {
        setSessionExpired(false)
        setComposeError(result.error || 'Email limit reached — please wait before trying again.')
        startComposeCooldown(result.retryAfterSeconds)
      } else {
        alert(`❌ Error: ${result.error || 'Failed to send email'}`)
      }
    } catch (error) {
      console.error('Error sending email:', error)
      alert('❌ Error sending email. Please try again.')
    }
  }

  const handleSessionRefresh = async () => {
    await fetchSessionToken()
    if (sessionTokenRef.current) {
      setSessionExpired(false)
      setComposeError('Session refreshed — you can send your email now.')
    } else {
      setComposeError('Could not refresh the session. Check your connection and try again.')
    }
  }

  const handleCloseCompose = () => {
    setShowComposeWidget(false)
    setComposeError('')
    setSessionExpired(false)
    setComposeFormData({
      email: '',
      date: '',
      time: '',
      subject: '',
      body: ''
    })
  }

  return (
    <div className="h-screen bg-white flex flex-col">
      {/* Top Header */}
      <header className="gmail-top-header flex items-center justify-between px-6 py-3 border-b border-gray-200">
        {/* Left side - Gmail Logo */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="lg:hidden p-2 rounded-md hover:bg-gray-100"
          >
            <Bars3Icon className="h-6 w-6" />
          </button>
          <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">G</span>
          </div>
          <span className="text-xl font-semibold text-gray-900">Gmail</span>
        </div>

        {/* Right side - User Profile */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              resetState()
              setTimeout(() => {
                // Reload all folders on refresh
                const loadAllFolders = async () => {
                  setLoading(true)
                  try {
                    const folderPromises = folders.map(folder => loadPortfolioData(folder.id))
                    const results = await Promise.all(folderPromises)
                    
                    const allData: PortfolioData = {}
                    results.forEach((data, index) => {
                      const folderId = folders[index].id
                      const freshData = data.map(item => ({
                        ...item,
                        starred: folderId === 'contact' ? false : (item.starred === true), // Contact items never start starred
                        read: folderId === 'contact' ? false : (item.read === true)        // Contact items never start read
                      }))
                      allData[folderId as keyof PortfolioData] = freshData
                    })
                    
                    setPortfolioData(allData)
                    setCurrentItems(allData.experiences || [])
                  } catch (error) {
                    console.error('Error refreshing data:', error)
                  } finally {
                    setLoading(false)
                  }
                }
                loadAllFolders()
              }, 100)
            }}
            className="p-2 rounded-md hover:bg-gray-100 transition-colors"
            title="Refresh all data"
          >
            <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={() => setShowProfilePopup(!showProfilePopup)}
            className="flex items-center space-x-2 px-3 py-1 rounded-full hover:bg-gray-100 transition-colors"
          >
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-sm">N</span>
            </div>
            <span className="text-sm font-medium text-gray-700">Nayanjyoti</span>
          </button>
        </div>
      </header>

      {/* Profile Popup */}
      {showProfilePopup && (
        <div className="fixed inset-0 z-50">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowProfilePopup(false)} />
          <div className="fixed top-16 right-6 w-80 bg-white rounded-lg shadow-lg border border-gray-200">
            <div className="p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-lg">N</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Nayanjyoti Kakati</h3>
                  <p className="text-sm text-gray-500">nayanjyoti@gmail.com</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">About</h4>
                  <p className="text-sm text-gray-600 leading-relaxed mb-3">
                    Full-stack developer passionate about creating innovative web applications. 
                    Specialized in React, Node.js, and modern web technologies.
                  </p>
                  <a 
                    href="https://nayan-portfolio-1757776403.s3.ap-south-1.amazonaws.com/portfolio/nayanjyoti+resume.pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-2 text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-sm font-medium">Download Resume</span>
                  </a>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Skills</h4>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">React</span>
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">Node.js</span>
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">TypeScript</span>
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">Next.js</span>
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">MongoDB</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Email Detail Modal */}
      {showEmailDetail && selectedItem && (
        <div className="fixed inset-0 z-50">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowEmailDetail(false)} />
          <div className="fixed inset-6 lg:inset-16 bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-w-4xl mx-auto">
            {/* Email Header */}
            <div className="gmail-email-header px-8 py-6 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2 leading-tight">{selectedItem.subject}</h2>
                  <div className="flex items-center space-x-4 text-sm text-gray-600">
                    <span className="flex items-center space-x-1">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>{formatDate(selectedItem.date)}</span>
                    </span>
                    {selectedItem.technologies && selectedItem.technologies.length > 0 && (
                      <span className="flex items-center space-x-1 text-blue-600">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>{selectedItem.technologies.length} technologies</span>
                      </span>
                    )}
                    {selectedItem.links && Object.keys(selectedItem.links).length > 0 && (
                      <span className="flex items-center space-x-1 text-green-600">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        <span>{Object.keys(selectedItem.links).length} links</span>
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setShowEmailDetail(false)}
                  className="p-3 rounded-full hover:bg-white hover:shadow-md transition-all duration-200 ml-4 group"
                >
                  <svg className="h-5 w-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Email Body */}
            <div className="flex-1 overflow-y-auto p-8">
              <div className="gmail-email-body max-w-none">
                {/* Main Content */}
                <div className="bg-gray-50 rounded-xl p-6 mb-8 border-l-4 border-blue-500">
                  <div className="text-gray-800 leading-relaxed text-lg whitespace-pre-wrap">
                    {selectedItem.content}
                  </div>
                </div>


                {/* Projects Section */}
                {selectedItem.projects && selectedItem.projects.length > 0 && (
                  <div className="mb-8">
                    <div className="flex items-center space-x-2 mb-4">
                      <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                        <svg className="h-4 w-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">Key Projects</h3>
                    </div>
                    <div className="space-y-4">
                      {selectedItem.projects.map((project) => (
                        <div key={project.id} className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-4 border border-purple-100">
                          <h4 className="text-lg font-semibold text-gray-900 mb-3">{project.name}</h4>
                          <p className="text-gray-700 leading-relaxed">{project.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Technologies Section */}
                {selectedItem.technologies && selectedItem.technologies.length > 0 && (
                  <div className="mb-8">
                    <div className="flex items-center space-x-2 mb-4">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                        <svg className="h-4 w-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">Technologies Used</h3>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {selectedItem.technologies.map(tech => (
                        <span
                          key={tech}
                          className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium shadow-sm hover:shadow-md transition-all duration-200 hover:scale-105"
                        >
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>
                )}


              </div>
            </div>

            {/* Email Footer */}
            <div className="px-8 py-6 border-t border-gray-100 bg-gradient-to-r from-gray-50 to-gray-100">
              <div className="flex justify-center">
                <button
                  onClick={() => {
                    handleStarToggle(selectedItem.id)
                    setSelectedItem(prev => prev ? { ...prev, starred: !prev.starred } : null)
                  }}
                  className={`flex items-center space-x-2 px-6 py-3 rounded-xl transition-all duration-200 hover:shadow-md min-w-[120px] justify-center ${
                    selectedItem.starred
                      ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                      : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                  }`}
                >
                  {selectedItem.starred ? (
                    <StarIconSolid className="h-5 w-5" />
                  ) : (
                    <StarIcon className="h-5 w-5" />
                  )}
                  <span className="text-sm font-medium">
                    {selectedItem.starred ? 'Starred' : 'Star'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex">
        {/* Left Sidebar */}
        <div className="hidden lg:flex lg:flex-col w-64 gmail-sidebar">
          {/* Compose Button */}
          <div className="px-6 py-4">
            <button 
              onClick={handleComposeClick}
              className="gmail-compose-btn flex items-center justify-center space-x-2"
            >
              <PlusIcon className="h-5 w-5" />
              <span>Compose</span>
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-2 py-2">
            <ul className="space-y-1">
              {folders.map((folder) => {
                const IconComponent = folder.icon
                const isActive = currentFolder === folder.id
                
                return (
                  <li key={folder.id}>
                    <button
                      onClick={() => handleFolderChange(folder.id)}
                      className={`gmail-folder-item ${
                        isActive ? 'gmail-folder-active' : 'gmail-folder-inactive'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <IconComponent className="h-5 w-5" />
                        <span>{folder.name}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {getFolderCounts(folder.id).unread > 0 && (
                          <span className="gmail-folder-unread">
                            {getFolderCounts(folder.id).unread}
                          </span>
                        )}
                        <span className="gmail-folder-count">
                          {getFolderCounts(folder.id).count}
                        </span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>
        </div>

        {/* Mobile Sidebar Overlay */}
        {showSidebar && (
          <div className="lg:hidden fixed inset-0 z-50">
            <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowSidebar(false)} />
            <div className="fixed left-0 top-16 h-full w-80 gmail-sidebar shadow-xl">
              <div className="px-6 py-4">
                <button 
                  onClick={handleComposeClick}
                  className="gmail-compose-btn flex items-center justify-center space-x-2"
                >
                  <PlusIcon className="h-5 w-5" />
                  <span>Compose</span>
                </button>
              </div>
              <nav className="px-2 py-2">
                <ul className="space-y-1">
                  {folders.map((folder) => {
                    const IconComponent = folder.icon
                    const isActive = currentFolder === folder.id
                    
                    return (
                      <li key={folder.id}>
                        <button
                          onClick={() => {
                            handleFolderChange(folder.id)
                            setShowSidebar(false)
                          }}
                          className={`gmail-folder-item ${
                            isActive ? 'gmail-folder-active' : 'gmail-folder-inactive'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <IconComponent className="h-5 w-5" />
                            <span>{folder.name}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            {getFolderCounts(folder.id).unread > 0 && (
                              <span className="gmail-folder-unread">
                                {getFolderCounts(folder.id).unread}
                              </span>
                            )}
                            <span className="gmail-folder-count">
                              {getFolderCounts(folder.id).count}
                            </span>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </nav>
            </div>
          </div>
        )}

        {/* Right Panel - Portfolio Items List */}
        <div className={`flex-1 flex flex-col gmail-email-list gmail-content-transition ${
          showCalendar ? 'w-4/5' : 'w-full'
        }`}>
          {/* Items Controls Header */}
          <div className="gmail-email-controls px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              {/* Left side - Items Controls */}
              <div className="gmail-selection-controls">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    className="gmail-checkbox"
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    checked={selectedItems.length === filteredItems.length && filteredItems.length > 0}
                  />
                  <button className="gmail-control-button">
                    <ChevronDownIcon className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center space-x-1">
                  <button 
                    className={`gmail-control-button gmail-star-btn ${allItemsStarred ? 'gmail-star-active' : ''}`}
                    onClick={handleStarAll}
                  >
                    {allItemsStarred ? (
                      <StarIconSolid className="h-4 w-4" />
                    ) : (
                      <StarIcon className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Right side - Search */}
              <div className="flex items-center space-x-2">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search items"
                    className="gmail-search-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <MagnifyingGlassIcon className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Items List */}
          <div className="flex-1 overflow-y-auto">
            {loading && Object.keys(portfolioData).length === 0 ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                  <p className="text-sm text-gray-500">Loading portfolio data...</p>
                </div>
              </div>
            ) : (
              <div className="gmail-email-list-content divide-y divide-gray-200">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    data-item-id={item.id}
                    className={`gmail-email-row ${
                      selectedItems.includes(item.id) ? 'gmail-email-selected' : 
                      item.read ? 'gmail-email-read' : 'gmail-email-unread'
                    }`}
                    onClick={() => handleItemClick(item.id)}
                  >
                    {/* Checkbox */}
                    <div className="mr-4">
                      <input
                        type="checkbox"
                        className="gmail-checkbox"
                        checked={selectedItems.includes(item.id)}
                        onChange={(e) => handleCheckboxChange(e, item.id)}
                      />
                    </div>

                    {/* Star */}
                    <div className="mr-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleStarToggle(item.id)
                        }}
                        className={`gmail-star-btn ${item.starred ? 'gmail-star-active' : ''} ${
                          selectedItems.includes(item.id) ? 'text-white hover:text-yellow-300' : ''
                        }`}
                      >
                        {item.starred ? (
                          <StarIconSolid className="h-4 w-4" />
                        ) : (
                          <StarIcon className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    {/* Item Content */}
                    <div className="gmail-email-content">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <span className={`gmail-email-subject ${
                            selectedItems.includes(item.id) ? 'text-white' :
                            !item.read ? 'text-gray-900 font-semibold' : 'text-gray-700'
                          }`}>
                            {item.subject}
                          </span>
                        </div>
                        <span className={`gmail-email-date ${
                          selectedItems.includes(item.id) ? 'text-white' : 'text-gray-500'
                        }`}>
                          {formatDate(item.date)}
                        </span>
                      </div>
                      <p className={`gmail-email-preview ${
                        selectedItems.includes(item.id) ? 'text-white' : 'text-gray-600'
                      }`}>
                        {item.preview}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Calendar Panel */}
        {showCalendar && (
          <div className="w-1/5 gmail-calendar-panel transition-all duration-500 ease-in-out">
            <div className="p-4 gmail-calendar-content">
                              <div className="flex items-center justify-between mb-0.5">
                  <h3 className="text-lg font-semibold text-gray-900">Calendar</h3>
                <button
                  onClick={() => setShowCalendar(false)}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
                             {/* Calendar Widget */}
               <div className="relative flex items-center justify-center space-x-3 mb-1">
                 {/* Left Arrow */}
                 <button
                   onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() - 1))}
                   className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                 >
                   <svg className="h-4 w-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                   </svg>
                 </button>
                 
                 {/* Date Display */}
                 <div className="relative">
                   <button
                     onClick={() => setShowDatePicker(!showDatePicker)}
                     className="px-4 py-2 text-lg font-semibold text-blue-900 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                   >
                     {selectedDate.getDate().toString().padStart(2, '0')}-{selectedDate.toLocaleDateString('en-US', { month: 'short' })}
                   </button>
                   
                   {/* Date Picker Popup */}
                   {showDatePicker && (
                     <>
                       {/* Backdrop for click outside */}
                       <div 
                         className="fixed inset-0 z-10" 
                         onClick={() => setShowDatePicker(false)}
                       />
                       <div className="absolute top-full mt-2 left-1/2 transform -translate-x-1/2 bg-white rounded-xl border border-blue-200 shadow-xl p-4 z-50 min-w-[280px]">
                         {/* Close Button */}
                         <button
                           onClick={() => setShowDatePicker(false)}
                           className="absolute top-2 right-2 p-1 rounded-full hover:bg-gray-100 transition-colors"
                         >
                           <svg className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                           </svg>
                         </button>
                         
                         <div className="grid grid-cols-7 gap-1 text-xs">
                           {/* Day headers */}
                           {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => (
                             <div key={day} className="text-center text-blue-600 font-medium py-1">
                               {day}
                             </div>
                           ))}
                           
                           {/* Calendar days */}
                           {(() => {
                             const date = new Date(calendarViewMonth.getFullYear(), calendarViewMonth.getMonth(), 1)
                             const firstDay = date.getDay()
                             const daysInMonth = new Date(calendarViewMonth.getFullYear(), calendarViewMonth.getMonth() + 1, 0).getDate()
                             const totalCells = firstDay + daysInMonth
                             const weeksNeeded = Math.ceil(totalCells / 7)
                             
                             return Array.from({ length: weeksNeeded * 7 }, (_, i) => {
                               const dayNumber = i - firstDay + 1
                               const isValidDay = dayNumber > 0 && dayNumber <= daysInMonth
                               const currentDate = new Date(calendarViewMonth.getFullYear(), calendarViewMonth.getMonth(), dayNumber)
                               const isSelected = isValidDay && 
                                 currentDate.getDate() === selectedDate.getDate() && 
                                 currentDate.getMonth() === selectedDate.getMonth() &&
                                 currentDate.getFullYear() === selectedDate.getFullYear()
                               
                               return (
                                 <button
                                   key={`cal1-${calendarViewMonth.getFullYear()}-${calendarViewMonth.getMonth()}-${i}`}
                                   onClick={() => isValidDay && handleDateSelect(currentDate)}
                                   className={`p-2 rounded-lg text-sm transition-all duration-200 ${
                                     isValidDay
                                       ? isSelected
                                         ? 'bg-blue-500 text-white font-bold'
                                         : 'hover:bg-blue-100 text-gray-700'
                                       : 'text-gray-300'
                                   }`}
                                   disabled={!isValidDay}
                                 >
                                   {isValidDay ? dayNumber : ''}
                                 </button>
                               )
                             })
                           })()}
                         </div>
                         
                         {/* Month Navigation */}
                         <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
                           <button
                             onClick={() => setCalendarViewMonth(new Date(calendarViewMonth.getFullYear(), calendarViewMonth.getMonth() - 1, 1))}
                             className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                           >
                             <svg className="h-4 w-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                             </svg>
                           </button>
                           <span className="text-sm font-medium text-gray-700">
                             {calendarViewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                           </span>
                           <button
                             onClick={() => setCalendarViewMonth(new Date(calendarViewMonth.getFullYear(), calendarViewMonth.getMonth() + 1, 1))}
                             className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                           >
                             <svg className="h-4 w-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                             </svg>
                           </button>
                         </div>
                       </div>
                     </>
                   )}
                 </div>
                 
                 {/* Today Icon - only show when selected date is not today */}
                 {!isToday(selectedDate) && (
                   <button
                     onClick={handleTodayClick}
                     className="p-2 rounded-lg hover:bg-blue-100 transition-colors bg-blue-50 border border-blue-200"
                     title="Go to today"
                   >
                     <svg className="h-4 w-4 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                       <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
                     </svg>
                   </button>
                 )}
                 
                 {/* Right Arrow */}
                 <button
                   onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + 1))}
                   className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                 >
                   <svg className="h-4 w-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                   </svg>
                 </button>
               </div>
               
               {/* Date Picker Popup */}
               {showDatePicker && (
                 <>
                   {/* Backdrop for click outside */}
                   <div 
                     className="fixed inset-0 z-10" 
                     onClick={() => setShowDatePicker(false)}
                   />
                   <div className="absolute top-full mt-2 left-1/2 transform -translate-x-1/2 bg-white rounded-xl border border-blue-200 shadow-xl pt-6 px-4 pb-4 z-20 gmail-date-picker-popup min-w-[280px]">
                   {/* Close Button */}
                   <button
                     onClick={() => setShowDatePicker(false)}
                     className="absolute top-1.5 right-1.5 p-1 rounded-full hover:bg-gray-100 transition-colors"
                   >
                     <svg className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                     </svg>
                   </button>
                   
                   <div className="grid grid-cols-7 gap-1 text-xs">
                     {/* Day headers */}
                     {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => (
                       <div key={day} className="text-center text-gray-600 font-medium py-1">
                         {day}
                       </div>
                     ))}
                     
                     {/* Calendar days */}
                     {(() => {
                       const date = new Date(calendarViewMonth.getFullYear(), calendarViewMonth.getMonth(), 1)
                       const firstDay = date.getDay()
                       const daysInMonth = new Date(calendarViewMonth.getFullYear(), calendarViewMonth.getMonth() + 1, 0).getDate()
                       const totalCells = firstDay + daysInMonth
                       const weeksNeeded = Math.ceil(totalCells / 7)
                       
                       return Array.from({ length: weeksNeeded * 7 }, (_, i) => {
                         const dayNumber = i - firstDay + 1
                         const isValidDay = dayNumber > 0 && dayNumber <= daysInMonth
                         const currentDate = new Date(calendarViewMonth.getFullYear(), calendarViewMonth.getMonth(), dayNumber)
                         const isSelected = isValidDay && 
                           currentDate.getDate() === selectedDate.getDate() && 
                           currentDate.getMonth() === selectedDate.getMonth() &&
                           currentDate.getFullYear() === selectedDate.getFullYear()
                         
                         return (
                           <button
                             key={`cal2-${calendarViewMonth.getFullYear()}-${calendarViewMonth.getMonth()}-${i}`}
                             onClick={() => isValidDay && handleDateSelect(currentDate)}
                             className={`p-2 rounded-lg text-sm transition-all duration-200 ${
                               isValidDay
                                 ? isSelected
                                   ? 'bg-blue-500 text-white font-bold'
                                   : 'hover:bg-blue-100 text-gray-700'
                                 : 'text-gray-300'
                             }`}
                             disabled={!isValidDay}
                           >
                             {isValidDay ? dayNumber : ''}
                           </button>
                         )
                       })
                     })()}
                   </div>
                   
                   {/* Month Navigation */}
                   <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
                     <button
                       onClick={() => setCalendarViewMonth(new Date(calendarViewMonth.getFullYear(), calendarViewMonth.getMonth() - 1, 1))}
                       className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                     >
                       <svg className="h-4 w-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                       </svg>
                     </button>
                     <span className="text-sm font-medium text-gray-700">
                       {calendarViewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                     </span>
                     <button
                       onClick={() => setCalendarViewMonth(new Date(calendarViewMonth.getFullYear(), calendarViewMonth.getMonth() + 1, 1))}
                       className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                     >
                       <svg className="h-4 w-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                     </svg>
                   </button>
                 </div>
               </div>
                 </>
               )}
             </div>
             
                           {/* 24-Hour Time Slots */}
              <div className="space-y-1 px-2">
                {Array.from({ length: 24 }, (_, i) => (
                  <div key={`main-time-slot-${i}`} className="gmail-time-slot gmail-time-slot-enhanced">
                    <div className="flex items-center px-1">
                      <div className="w-10 h-7 bg-blue-50 rounded-md flex items-center justify-center mx-2 flex-shrink-0 border border-blue-100">
                        <span className="text-xs font-medium text-blue-700">
                          {i.toString().padStart(2, '0')}
                        </span>
                      </div>
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <div 
                          className={`gmail-time-clickable h-6 border transition-all duration-150 relative group ${
                            selectedTimeSlot === `${i.toString().padStart(2, '0')}:00`
                              ? 'bg-blue-50 border-blue-200'
                              : 'bg-white border-gray-100 hover:bg-blue-50/60'
                          }`}
                          onClick={() => handleCalendarSlotClick(`${i.toString().padStart(2, '0')}:00`)}
                          title={`${i.toString().padStart(2, '0')}:00`}
                        >
                          <span className="absolute inset-0 flex items-center justify-center text-[9px] text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                            00-29
                          </span>
                        </div>
                        <div 
                          className={`gmail-time-clickable h-6 border transition-all duration-150 relative group ${
                            selectedTimeSlot === `${i.toString().padStart(2, '0')}:30`
                              ? 'bg-blue-50 border-blue-200'
                              : 'bg-white border-gray-100 hover:bg-blue-50/60'
                          }`}
                          onClick={() => handleCalendarSlotClick(`${i.toString().padStart(2, '0')}:30`)}
                          title={`${i.toString().padStart(2, '0')}:30`}
                        >
                          <span className="absolute inset-0 flex items-center justify-center text-[9px] text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                            30-59
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Schedule Call Section */}
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <h4 className="font-semibold text-blue-800 mb-2">Schedule 1:1 Call</h4>
                {!selectedDate || !selectedTimeSlot ? (
                  <p className="text-sm text-blue-600">Select a date and time above</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-blue-700">
                      Selected: {formatDisplayDate(selectedDate)} at {selectedTimeSlot}
                    </p>
                    <button
                      onClick={handleScheduleCall}
                      className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      Send Schedule Request
                    </button>
                  </div>
                )}
              </div>
           </div>
        )}

        {/* Rightmost Column - Calendar Icon */}
        <div className="hidden lg:flex lg:flex-col w-20 gmail-sidebar border-l border-gray-200">
          <div className="p-3">
            <button
              onClick={() => setShowCalendar(!showCalendar)}
              className={`gmail-calendar-btn ${
                showCalendar 
                  ? 'text-gray-800' 
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <CalendarIcon className="h-8 w-8" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Calendar Overlay */}
      {showCalendar && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowCalendar(false)} />
          <div className="fixed bottom-20 left-4 right-4 h-96 bg-white rounded-lg shadow-xl border border-gray-200">
            <div className="p-4 h-full overflow-y-auto gmail-calendar-content">
                              <div className="flex items-center justify-between mb-0.5">
                  <h3 className="text-lg font-semibold text-gray-900">Calendar</h3>
                <button
                  onClick={() => setShowCalendar(false)}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              {/* Calendar Widget */}
              <div className="relative flex items-center justify-center space-x-3 mb-0.5 z-10">
                {/* Left Arrow */}
                <button
                  onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() - 1))}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <svg className="h-4 w-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                
                {/* Date Display */}
                <div className="relative">
                  <button
                    onClick={() => setShowDatePicker(!showDatePicker)}
                    className="px-4 py-2 text-lg font-semibold text-blue-900 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                  >
                    {selectedDate.getDate().toString().padStart(2, '0')}-{selectedDate.toLocaleDateString('en-US', { month: 'short' })}
                  </button>
                  
                  {/* Date Picker Popup */}
                  {showDatePicker && (
                    <>
                      {/* Backdrop for click outside */}
                      <div 
                        className="fixed inset-0 z-10" 
                        onClick={() => setShowDatePicker(false)}
                      />
                      <div className="absolute top-full mt-2 left-1/2 transform -translate-x-1/2 bg-white rounded-xl border border-blue-200 shadow-xl p-4 z-50 min-w-[280px]">
                        {/* Close Button */}
                        <button
                          onClick={() => setShowDatePicker(false)}
                          className="absolute top-2 right-2 p-1 rounded-full hover:bg-gray-100 transition-colors"
                        >
                          <svg className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                        
                        <div className="grid grid-cols-7 gap-1 text-xs">
                          {/* Day headers */}
                          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => (
                            <div key={day} className="text-center text-blue-600 font-medium py-1">
                              {day}
                            </div>
                          ))}
                          
                          {/* Calendar days */}
                          {(() => {
                            const date = new Date(calendarViewMonth.getFullYear(), calendarViewMonth.getMonth(), 1)
                            const firstDay = date.getDay()
                            const daysInMonth = new Date(calendarViewMonth.getFullYear(), calendarViewMonth.getMonth() + 1, 0).getDate()
                            const totalCells = firstDay + daysInMonth
                            const weeksNeeded = Math.ceil(totalCells / 7)
                            
                            return Array.from({ length: weeksNeeded * 7 }, (_, i) => {
                              const dayNumber = i - firstDay + 1
                              const isValidDay = dayNumber > 0 && dayNumber <= daysInMonth
                              const currentDate = new Date(calendarViewMonth.getFullYear(), calendarViewMonth.getMonth(), dayNumber)
                              const isSelected = isValidDay && 
                                currentDate.getDate() === selectedDate.getDate() && 
                                currentDate.getMonth() === selectedDate.getMonth() &&
                                currentDate.getFullYear() === selectedDate.getFullYear()
                              
                              return (
                                <button
                                  key={`${calendarViewMonth.getFullYear()}-${calendarViewMonth.getMonth()}-${i}`}
                                  onClick={() => isValidDay && handleDateSelect(currentDate)}
                                  className={`p-2 rounded-lg text-sm transition-all duration-200 ${
                                    isValidDay
                                      ? isSelected
                                        ? 'bg-blue-500 text-white font-bold'
                                        : 'hover:bg-blue-100 text-gray-700'
                                      : 'text-gray-300'
                                  }`}
                                  disabled={!isValidDay}
                                >
                                  {isValidDay ? dayNumber : ''}
                                </button>
                              )
                            })
                          })()}
                        </div>
                        
                        {/* Month Navigation */}
                        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
                          <button
                            onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1))}
                            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            <svg className="h-4 w-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                          </button>
                          <span className="text-sm font-medium text-gray-700">
                            {selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                          </span>
                          <button
                            onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1))}
                            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            <svg className="h-4 w-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                
                {/* Today Icon - only show when selected date is not today */}
                {!isToday(selectedDate) && (
                  <button
                    onClick={handleTodayClick}
                    className="p-2 rounded-lg hover:bg-blue-100 transition-colors bg-blue-50 border border-blue-200"
                    title="Go to today"
                  >
                    <svg className="h-4 w-4 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
                    </svg>
                  </button>
                )}
                
                {/* Right Arrow */}
                <button
                  onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + 1))}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <svg className="h-4 w-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
              
              {/* Date Picker Popup (Mobile) */}
              {showDatePicker && (
                <div className="absolute top-full mt-2 left-1/2 transform -translate-x-1/2 bg-white rounded-xl border border-blue-200 shadow-xl p-4 z-20 min-w-[280px]">
                  <div className="grid grid-cols-7 gap-1 text-xs">
                    {/* Day headers */}
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => (
                      <div key={day} className="text-center text-blue-600 font-medium py-1">
                        {day}
                      </div>
                    ))}
                    
                    {/* Calendar days */}
                    {(() => {
                      const date = new Date(calendarViewMonth.getFullYear(), calendarViewMonth.getMonth(), 1)
                      const firstDay = date.getDay()
                      const daysInMonth = new Date(calendarViewMonth.getFullYear(), calendarViewMonth.getMonth() + 1, 0).getDate()
                      const totalCells = firstDay + daysInMonth
                      const weeksNeeded = Math.ceil(totalCells / 7)
                      
                      return Array.from({ length: weeksNeeded * 7 }, (_, i) => {
                        const dayNumber = i - firstDay + 1
                        const isValidDay = dayNumber > 0 && dayNumber <= daysInMonth
                        const currentDate = new Date(calendarViewMonth.getFullYear(), calendarViewMonth.getMonth(), dayNumber)
                        const isSelected = isValidDay && 
                          currentDate.getDate() === selectedDate.getDate() && 
                          currentDate.getMonth() === selectedDate.getMonth() &&
                          currentDate.getFullYear() === selectedDate.getFullYear()
                        
                        return (
                          <button
                            key={`cal3-${calendarViewMonth.getFullYear()}-${calendarViewMonth.getMonth()}-${i}`}
                            onClick={() => isValidDay && handleDateSelect(currentDate)}
                            className={`p-2 rounded-lg text-sm transition-all duration-200 ${
                              isValidDay
                                ? isSelected
                                  ? 'bg-blue-500 text-white font-bold'
                                  : 'hover:bg-blue-100 text-gray-700'
                                : 'text-gray-300'
                            }`}
                            disabled={!isValidDay}
                          >
                            {isValidDay ? dayNumber : ''}
                          </button>
                        )
                      })
                    })()}
                  </div>
                  
                  {/* Month Navigation */}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
                    <button
                      onClick={() => setCalendarViewMonth(new Date(calendarViewMonth.getFullYear(), calendarViewMonth.getMonth() - 1, 1))}
                      className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <svg className="h-4 w-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <span className="text-sm font-medium text-gray-700">
                      {calendarViewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </span>
                    <button
                      onClick={() => setCalendarViewMonth(new Date(calendarViewMonth.getFullYear(), calendarViewMonth.getMonth() + 1, 1))}
                      className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <svg className="h-4 w-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
              
                             {/* 24-Hour Time Slots (Mobile) */}
               <div className="space-y-0.5">
                 {Array.from({ length: 24 }, (_, i) => (
                   <div key={`time-slot-${i}`} className="gmail-time-slot">
                     <div className="flex items-center">
                       <div className="w-8 h-5 bg-blue-100 rounded-full flex items-center justify-center mr-1.5 flex-shrink-0">
                         <span className="text-[10px] font-medium text-blue-800">
                           {i.toString().padStart(2, '0')}
                         </span>
                       </div>
                       <div className="flex-1 grid grid-cols-2 gap-1">
                         <div 
                           className={`gmail-time-clickable h-5 rounded-lg border transition-all duration-200 ${
                             selectedTimeSlot === `${i.toString().padStart(2, '0')}:00`
                               ? 'bg-blue-200 border-blue-300 shadow-md'
                               : 'bg-gray-100 border-transparent'
                           }`}
                           onClick={() => handleCalendarSlotClick(`${i.toString().padStart(2, '0')}:00`)}
                           title={`${i.toString().padStart(2, '0')}:00`}
                         ></div>
                         <div 
                           className={`gmail-time-clickable h-5 rounded-lg border transition-all duration-200 ${
                             selectedTimeSlot === `${i.toString().padStart(2, '0')}:30`
                               ? 'bg-blue-200 border-blue-300 shadow-md'
                               : 'bg-gray-100 border-transparent'
                           }`}
                           onClick={() => handleCalendarSlotClick(`${i.toString().padStart(2, '0')}:30`)}
                           title={`${i.toString().padStart(2, '0')}:30`}
                         ></div>
                       </div>
                     </div>
                   </div>
                 ))}
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      <div className="lg:hidden gmail-mobile-nav">
        <nav className="flex justify-around">
          {folders.map((folder) => {
            const IconComponent = folder.icon
            const isActive = currentFolder === folder.id
            
            return (
              <button
                key={folder.id}
                onClick={() => handleFolderChange(folder.id)}
                className={`gmail-mobile-nav-item ${
                  isActive ? 'gmail-mobile-nav-active' : 'gmail-mobile-nav-inactive'
                }`}
              >
                <IconComponent className="h-6 w-6 mb-1" />
                <span>{folder.name}</span>
              </button>
            )
          })}
          
          {/* Mobile Calendar Button */}
          <button
            onClick={() => setShowCalendar(!showCalendar)}
            className={`gmail-mobile-nav-item ${
              showCalendar ? 'gmail-mobile-nav-active' : 'gmail-mobile-nav-inactive'
            }`}
          >
            <CalendarIcon className="h-6 w-6 mb-1" />
            <span>Calendar</span>
          </button>
        </nav>
      </div>

      {/* Compose Email Widget */}
      {showComposeWidget && (
        <div className="fixed bottom-6 right-6 w-96 bg-white rounded-lg shadow-2xl border border-gray-200 z-50">
          {/* Widget Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
            <h3 className="text-lg font-semibold text-gray-900">Compose Email</h3>
            <button
              onClick={handleCloseCompose}
              className="p-1 rounded-full hover:bg-gray-200 transition-colors"
            >
              <svg className="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Widget Form */}
          <form onSubmit={handleComposeSubmit} className="p-4 space-y-4">
            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your Email ID
              </label>
              <input
                type="email"
                value={composeFormData.email}
                onChange={(e) => handleComposeFormChange('email', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="your.email@example.com"
                required
              />
            </div>

            {/* Date and Time Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={composeFormData.date}
                  onChange={(e) => handleComposeFormChange('date', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Time
                </label>
                <input
                  type="time"
                  value={composeFormData.time}
                  onChange={(e) => handleComposeFormChange('time', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
            </div>

            {/* Subject Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Subject
              </label>
              <input
                type="text"
                value={composeFormData.subject}
                onChange={(e) => handleComposeFormChange('subject', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Email subject"
                required
              />
            </div>

            {/* Body Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Message Body
              </label>
              <textarea
                value={composeFormData.body}
                onChange={(e) => handleComposeFormChange('body', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={4}
                placeholder="Type your message here..."
                required
              />
            </div>

            {/* Status / Errors */}
            {(composeError || sessionExpired) && (
              <div className="flex flex-col gap-2">
                {composeError && (
                  <p className={`text-sm ${sessionExpired ? 'text-orange-600' : 'text-red-500'}`}>
                    {composeError}
                    {composeCooldown > 0 ? ` — you can try again in ${composeCooldown}s` : ''}
                  </p>
                )}
                {sessionExpired && (
                  <button
                    type="button"
                    onClick={handleSessionRefresh}
                    disabled={sessionRefreshing}
                    className="self-start text-sm px-4 py-1.5 rounded-md border border-orange-400 text-orange-600 hover:bg-orange-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sessionRefreshing ? 'Refreshing…' : 'Refresh session token'}
                  </button>
                )}
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={composeCooldown > 0}
                className="bg-blue-500 text-white px-6 py-2 rounded-md hover:bg-blue-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {composeCooldown > 0 ? `Wait ${composeCooldown}s…` : 'Send Email'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}