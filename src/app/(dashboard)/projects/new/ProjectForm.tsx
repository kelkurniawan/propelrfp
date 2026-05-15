"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ProjectForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const title = fd.get("title");
    if (typeof title !== "string" || !title.trim()) {
      setError("Project title is required.");
      setLoading(false);
      return;
    }
    const body = {
      title,
      client_name: (fd.get("client_name") as string) || null,
      deadline: (fd.get("deadline") as string) || null,
      notes: (fd.get("notes") as string) || null,
      rfp_text: (fd.get("rfp_text") as string) || null,
    };

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json() as {
        data: { project: { id: string }; sections: unknown[] } | null;
        error: { code: string; message: string } | null;
      };

      if (!res.ok || json.error) {
        setError(json.error?.message ?? "Something went wrong");
        return;
      }

      const { project } = json.data!;

      if (body.rfp_text) {
        router.push(`/projects/${project.id}/sections`);
      } else {
        router.push(`/projects/${project.id}`);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="title">Project title *</Label>
          <Input
            id="title"
            name="title"
            required
            placeholder="Q3 2026 City Transport RFP"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="client_name">Client name</Label>
          <Input
            id="client_name"
            name="client_name"
            placeholder="Department of Transport"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="deadline">Submission deadline</Label>
          <Input
            id="deadline"
            name="deadline"
            type="date"
            className="mt-1"
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="notes">Internal notes</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={3}
            placeholder="Key win themes, price constraints, competitor notes…"
            className="mt-1"
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="rfp_text">Paste RFP text</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            AI will auto-detect sections. You can also skip and add sections manually.
          </p>
          <Textarea
            id="rfp_text"
            name="rfp_text"
            rows={10}
            placeholder="Paste the full RFP document text here…"
            className="mt-1 font-mono text-xs"
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 rounded-md border border-red-200 bg-red-50 px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "Creating…" : "Create proposal"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/projects")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
