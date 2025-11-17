import type { ProcessedMarkdown } from './types'
import type { FontOption } from '../App'

export interface ManualMetadataInput {
  url: string
  title: string
  authors: string[]
  siteName?: string
  accessDate?: string
}

export interface PersistedSession {
  fileName: string | null
  originalMarkdown: string
  processed: ProcessedMarkdown | null
  manualMetadataOverrides: Record<string, ManualMetadataInput>
  selectedFontFamily: FontOption
  bodyFontSize: number
  promptForManualMetadata: boolean
}

const STORAGE_KEY = 'markdown-pdf-session'

export function loadPersistedSession(): PersistedSession | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return null
    }

    const parsed = JSON.parse(stored) as PersistedSession
    
    // Basic validation
    if (typeof parsed !== 'object' || parsed === null) {
      console.warn('Invalid persisted session data')
      clearPersistedSession()
      return null
    }

    return parsed
  } catch (error) {
    console.error('Failed to load persisted session:', error)
    clearPersistedSession()
    return null
  }
}

export function savePersistedSession(session: PersistedSession): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const serialized = JSON.stringify(session)
    localStorage.setItem(STORAGE_KEY, serialized)
  } catch (error) {
    console.error('Failed to save session to localStorage:', error)
  }
}

export function clearPersistedSession(): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error('Failed to clear persisted session:', error)
  }
}
