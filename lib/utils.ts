import { PortfolioItem } from './types'
import { getDataSourceUrl } from './config'

export const toggleItemSelection = (
  itemId: string,
  selectedItems: string[],
  setSelectedItems: (items: string[]) => void
) => {
  setSelectedItems(
    selectedItems.includes(itemId)
      ? selectedItems.filter(id => id !== itemId)
      : [...selectedItems, itemId]
  )
}

export const selectAllItems = (
  items: PortfolioItem[],
  setSelectedItems: (items: string[]) => void
) => {
  setSelectedItems(items.map(item => item.id))
}

export const deselectAllItems = (
  setSelectedItems: (items: string[]) => void
) => {
  setSelectedItems([])
}

export const toggleStar = (
  itemId: string,
  items: PortfolioItem[],
  setItems: (items: PortfolioItem[]) => void
) => {
  setItems(
    items.map(item =>
      item.id === itemId
        ? { ...item, starred: !item.starred }
        : item
    )
  )
}

export const toggleAllStars = (
  items: PortfolioItem[],
  setItems: (items: PortfolioItem[]) => void
) => {
  const allStarred = items.every(item => item.starred)
  setItems(
    items.map(item => ({ ...item, starred: !allStarred }))
  )
}

export const markAsRead = (
  itemId: string,
  items: PortfolioItem[],
  setItems: (items: PortfolioItem[]) => void
) => {
  setItems(
    items.map(item =>
      item.id === itemId
        ? { ...item, read: true }
        : item
    )
  )
}

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString)
  const now = new Date()
  const diffTime = Math.abs(now.getTime() - date.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays === 1) {
    return 'Yesterday'
  } else if (diffDays < 7) {
    return `${diffDays} days ago`
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })
  }
}

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

export const loadPortfolioData = async (folder: string): Promise<PortfolioItem[]> => {
  try {
    const dataSourceUrl = getDataSourceUrl(folder)
    console.log(`Loading ${folder} data from ${dataSourceUrl}...`)
    
    const response = await fetch(dataSourceUrl)
    if (!response.ok) {
      throw new Error(`Failed to load ${folder} data: ${response.status} ${response.statusText}`)
    }
    const data = await response.json()
    const items = data[folder] || []
    console.log(`Loaded ${items.length} items from ${folder}`)
    return items
  } catch (error) {
    console.error(`Error loading ${folder} data:`, error)
    return []
  }
} 