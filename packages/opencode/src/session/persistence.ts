import { SupabaseMemoryStore, type PersistentMemory, type SessionMessage } from "../memory/supabase"

type PersistenceOptions = {
  ownerId: string
  projectId?: string | null
  sessionId: string
  store?: SupabaseMemoryStore
}

/** Coordinates session lifecycle persistence without making Supabase mandatory. */
export class SessionPersistence {
  private readonly ownerId: string
  private readonly projectId: string | null
  private readonly sessionId: string
  private readonly store: SupabaseMemoryStore

  constructor(options: PersistenceOptions) {
    this.ownerId = options.ownerId
    this.projectId = options.projectId ?? null
    this.sessionId = options.sessionId
    this.store = options.store ?? new SupabaseMemoryStore()
  }

  async restoreMemory(limit = 50): Promise<PersistentMemory[]> {
    return this.store.list(this.ownerId, this.projectId ?? undefined, limit)
  }

  async recordMessage(message: Omit<SessionMessage, "owner_id" | "session_id" | "sequence_no">): Promise<SessionMessage> {
    return this.store.appendMessage({
      ...message,
      owner_id: this.ownerId,
      session_id: this.sessionId,
    })
  }

  async checkpoint(state: Record<string, unknown>, label = "autosave"): Promise<void> {
    await this.store.saveCheckpoint(this.ownerId, this.sessionId, state, label)
  }

  async recordUsage(event: Record<string, unknown>): Promise<void> {
    await this.store.recordUsage({
      ...event,
      owner_id: this.ownerId,
      project_id: this.projectId,
      session_id: this.sessionId,
    })
  }

  async complete(summary?: string): Promise<void> {
    await this.checkpoint({ summary: summary ?? null }, "session-complete")
  }
}

/** Returns undefined when Supabase is not configured, preserving local-only operation. */
export function createSessionPersistence(options: Omit<PersistenceOptions, "store">): SessionPersistence | undefined {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return undefined
  return new SessionPersistence(options)
}

