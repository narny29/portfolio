import { Folder } from './types'
import { 
  BriefcaseIcon, 
  RocketLaunchIcon, 
  AcademicCapIcon, 
  EnvelopeIcon 
} from '@heroicons/react/24/outline'

export const folders: Folder[] = [
  { id: 'experiences', name: 'Experiences', icon: BriefcaseIcon, count: 0, unread: 0 },
  { id: 'projects', name: 'Projects', icon: RocketLaunchIcon, count: 0, unread: 0 },
  { id: 'skills', name: 'Skills', icon: AcademicCapIcon, count: 0, unread: 0 },
  { id: 'contact', name: 'Contact', icon: EnvelopeIcon, count: 0, unread: 0 }
]

// This will be replaced with dynamic loading from JSON files
export const initialData = {
  experiences: [],
  projects: [],
  skills: [],
  contact: []
} 