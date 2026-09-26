export interface Project {
  id: string
  name: string
  description: string
}

export interface PortfolioItem {
  id: string
  subject: string
  preview: string
  content: string
  date: string
  starred: boolean
  read: boolean
  technologies?: string[]
  links?: Record<string, string>
  folder?: string
  projects?: Project[]
}

export interface Folder {
  id: string
  name: string
  icon: any
  count: number
  unread: number
}

export interface GmailState {
  currentFolder: string
  showSidebar: boolean
  selectedItems: string[]
}

export interface PortfolioData {
  experiences?: PortfolioItem[]
  projects?: PortfolioItem[]
  skills?: PortfolioItem[]
  contact?: PortfolioItem[]
}

export interface ScheduleCallRequest {
  requestedDate: string;
  requestedTime: string;
  requestedDateTime: string;
}