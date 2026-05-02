"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type SearchHit = {
  id: string;
  doc_id: string;
  doc_name: string;
  content: string;
  chunk_index: number;
  similarity: number;
};

export function SearchForm() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setSearched(false);

    const res = await fetch("/api/kb/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const json = await res.json();
    setLoading(false);
    setSearched(true);

    if (json.error) {
      toast.error(json.error.message);
      return;
    }
    setHits((json.data as SearchHit[]) ?? []);
  }

  return (
    <div>
      <form onSubmit={handleSearch} className="flex gap-3">
        <textarea
          rows={3}
          placeholder="Enter a query to test retrieval…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button type="submit" disabled={loading} className="self-start">
          {loading ? "Searching…" : "Search"}
        </Button>
      </form>

      {hits.length > 0 && (
        <div className="mt-6 space-y-4">
          {hits.map((hit) => (
            <div key={hit.id} className="rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{hit.doc_name}</span>
                <span className="text-xs text-muted-foreground">chunk #{hit.chunk_index}</span>
              </div>
              <div className="mt-2">
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>Similarity</span>
                  <span>{(hit.similarity * 100).toFixed(1)}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(hit.similarity * 100).toFixed(1)}%` }}
                  />
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {hit.content.length > 500
                  ? `${hit.content.slice(0, 500)}…`
                  : hit.content}
              </p>
            </div>
          ))}
        </div>
      )}

      {searched && hits.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          No chunks matched. Try a different query or verify that documents have been processed.
        </p>
      )}
    </div>
  );
}
