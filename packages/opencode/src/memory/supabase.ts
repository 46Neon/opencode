export type MemoryKind = "fact" | "preference" | "decision" | "summary" | "note"

export type PersistentMemory = {
  id?: string
  owner_id: string
  project_id?: string | null
  session_id?: string | null
  kind: MemoryKind
  content: string
  metadata?: Record<string, unknown>
  embedding?: unknown
  importance?: number
  expires_at?: string | null
  created_at?: string
  updated_at?: string
}

export type SessionMessage = {
  owner_id: string
  session_id: string
  sequence_no: number
  role: "system" | "user" | "assistant" | "tool"
  content: string
  tool_name?: string | null
  tool_call_id?: string | null
  token_count?: number | null
  metadata?: Record<string, unknown>
}

type SupabaseMemoryOptions = { url?: string; serviceRoleKey?: string; fetcher?: typeof fetch }

/** Backend-only persistence adapter. Never expose the service-role key to the web app. */
export class SupabaseMemoryStore {
  private readonly baseUrl: string
  private readonly serviceRoleKey: string
  private readonly fetcher: typeof fetch

  constructor(options: SupabaseMemoryOptions = {}) {
    const url = options.url ?? process.env.SUPABASE_URL
    const key = options.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    this.baseUrl = url.replace(/\/+$/, "")
    this.serviceRoleKey = key
    this.fetcher = options.fetcher ?? fetch
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    })
    if (!response.ok) throw new Error(`Supabase request failed (${response.status}): ${await response.text().catch(() => "")}`)
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  async list(ownerId: string, projectId?: string, limit = 50): Promise<PersistentMemory[]> {
    const params = new URLSearchParams({ owner_id: `eq.${ownerId}`, select: "*", order: "importance.desc,updated_at.desc", limit: String(Math.max(1, Math.min(limit, 200))) })
    if (projectId) params.set("project_id", `eq.${projectId}`)
    return this.request<PersistentMemory[]>(`opencode_memories?${params}`)
  }

  async save(memory: PersistentMemory): Promise<PersistentMemory> {
    const rows = await this.request<PersistentMemory[]>("opencode_memories", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...memory, metadata: memory.metadata ?? {}, importance: memory.importance ?? 3 }),
    })
    if (!rows[0]) throw new Error("Supabase returned no memory row")
    return rows[0]
  }

  async touch(ownerId: string, memoryId: string): Promise<void> {
    const params = new URLSearchParams({ id: `eq.${memoryId}`, owner_id: `eq.${ownerId}` })
    await this.request<void>(`opencode_memories?${params}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ last_accessed_at: new Date().toISOString(), access_count: "access_count + 1" }),
    })
  }

  async remove(ownerId: string, memoryId: string): Promise<void> {
    const params = new URLSearchParams({ id: `eq.${memoryId}`, owner_id: `eq.${ownerId}` })
    await this.request<void>(`opencode_memories?${params}`, { method: "DELETE", headers: { Prefer: "return=minimal" } })
  }

  async nextMessageSequence(sessionId: string): Promise<number> {
    const rows = await this.request<{ sequence_no: number }[]>(`rpc/opencode_next_message_sequence`, {
      method: "POST", body: JSON.stringify({ p_session_id: sessionId }),
    })
    return Number(rows[0]?.sequence_no ?? 1)
  }

  async appendMessage(message: Omit<SessionMessage, "sequence_no"> & { sequence_no?: number }): Promise<SessionMessage> {
    const sequence_no = message.sequence_no ?? await this.nextMessageSequence(message.session_id)
    const rows = await this.request<SessionMessage[]>("opencode_session_messages", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...message, sequence_no, metadata: message.metadata ?? {} }),
    })
    if (!rows[0]) throw new Error("Supabase returned no message row")
    return rows[0]
  }

  async saveCheckpoint(ownerId: string, sessionId: string, state: Record<string, unknown>, label = "autosave"): Promise<void> {
    await this.request("opencode_session_checkpoints", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ owner_id: ownerId, session_id: sessionId, state, label }),
    })
  }

  async recordUsage(event: Record<string, unknown>): Promise<void> {
    await this.request("opencode_usage_events", {
      method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(event),
    })
  }
}
