export type WasmRuntimeStatus = "unsupported" | "disabled" | "ready" | "failed"

export type WasmModule = WebAssembly.WebAssemblyInstantiatedSource

const configuredUrl = () => {
  const value = import.meta.env.VITE_OPENCODE_WASM_URL?.trim()
  return value ? value : null
}

export const wasmSupported = () =>
  typeof WebAssembly === "object" &&
  typeof WebAssembly.instantiate === "function" &&
  typeof WebAssembly.compile === "function"

export const wasmModuleUrl = (value = configuredUrl()) => {
  if (!value) return null
  try {
    const url = new URL(value, window.location.origin)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url
  } catch {
    return null
  }
}

/**
 * Loads an explicitly configured WebAssembly module without executing arbitrary
 * native binaries. The module must expose its own safe ABI and may be hosted as
 * a Pages static asset or returned by the application backend.
 */
export async function loadWasmModule(value?: string): Promise<WasmModule | null> {
  if (!wasmSupported()) return null
  const url = wasmModuleUrl(value)
  if (!url) return null

  const response = await fetch(url, { credentials: "same-origin" })
  if (!response.ok) throw new Error(`WebAssembly module request failed: ${response.status}`)

  const bytes = await response.arrayBuffer()
  return WebAssembly.instantiate(bytes, {})
}

export async function probeWasmModule(value?: string): Promise<WasmRuntimeStatus> {
  if (!wasmSupported()) return "unsupported"
  if (!wasmModuleUrl(value)) return "disabled"
  try {
    await loadWasmModule(value)
    return "ready"
  } catch {
    return "failed"
  }
}
