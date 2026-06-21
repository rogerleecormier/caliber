import { useQuery } from "@tanstack/react-query"
import { useDebouncedValue } from "@tanstack/react-pacer"

interface VectorSearchResult {
  parsedQuery?: {
    title?: string
    remote?: boolean
    location?: string
    skills?: string[]
    keywords?: string[]
  }
  raw?: unknown
}

export function useVectorSearch(query: string, enabled = true) {
  const [debouncedQuery] = useDebouncedValue(query, { wait: 400 })

  return useQuery<VectorSearchResult>({
    queryKey: ["vector-search", debouncedQuery],
    queryFn: async () => {
      const res = await fetch("/api/ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: debouncedQuery }),
      })
      if (!res.ok) throw new Error("Vector search failed")
      return res.json()
    },
    enabled: enabled && debouncedQuery.trim().length >= 3,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  })
}
