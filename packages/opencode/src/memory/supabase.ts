export type MemoryKind = "fact" | "preference" | "decision" | "summary" | "note"

export type PersistentMemory = {
  id?: string
  owner_id: string
  project_id?: string | null
  session_id?: string | null
  kind: MemoryKind
  content: string
  metadata?: Record<string, unknown>
  importance?: number
  created_at?: string
  updated_at?: string
}

type SupabaseMemoryOptions = {
  url?: string
  serviceRoleKey?: string
  fetcher?: typeof fetch
}

/**
 * Server-side Supabase adapter for OpenCode memory.
 * The service-role key must only be used by the backend, never by the web app.
 */
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
    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      throw new Error(`Supabase request failed (${response.status}): ${detail}`)
    }
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  async list(ownerId: string, projectId?: string, limit = 50): Promise<PersistentMemory[]> {
    const params = new URLSearchParams({
      owner_id: `eq.${ownerId}`,
      select: "*",
      order: "importance.desc,updated_at.desc",
      limit: String(Math.max(1, Math.min(limit, 200))),
    })
    if (projectId) params.set("project_id", `eq.${projectId}`)
    return this.request<PersistentMemory[]>(`opencode_memories?${params}`)
  }

  async save(memory: PersistentMemory): Promise<PersistentMemory> {
    const rows = await this.request<PersistentMemory[]>("opencode_memories", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        ...memory,
        metadata: memory.metadata ?? {},
        importance: memory.importance ?? 3,
      }),
    })
    const saved = rows[0]
    if (!saved) throw new Error("Supabase returned no memory row")
    return saved
  }

  async remove(ownerId: string, memoryId: string): Promise<void> {
    const params = new URLSearchParams({
      id: `eq.${memoryId}`,
      owner_id: `eq.${ownerId}`,
    })
    await this.request<void>(`opencode_memories?${params}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    })
  }
}

