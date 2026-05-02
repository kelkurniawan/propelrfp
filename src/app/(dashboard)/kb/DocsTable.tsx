"use client";

import { Fragment, useState } from "react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DocRow } from "./DropZone";

const STATUS_BADGE: Record<string, string> = {
  queued: "bg-secondary text-secondary-foreground",
  processing: "bg-blue-100 text-blue-700",
  ready: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export function DocsTable({
  docs,
  canManage,
  onRetried,
  onDeleted,
}: {
  docs: DocRow[];
  canManage: boolean;
  onRetried: (id: string) => void;
  onDeleted: (id: string) => void;
}) {
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<DocRow | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleError(id: string) {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function retry(doc: DocRow) {
    const res = await fetch(`/api/kb/docs/${doc.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry" }),
    });
    const json = await res.json();
    if (json.error) {
      toast.error(json.error.message);
      return;
    }
    onRetried(doc.id);
    toast.success("Retry queued");
  }

  async function download(doc: DocRow) {
    const res = await fetch(`/api/kb/docs/${doc.id}/download`);
    const json = await res.json();
    if (json.error) {
      toast.error(json.error.message);
      return;
    }
    window.open((json.data as { url: string }).url, "_blank");
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    const res = await fetch(`/api/kb/docs?id=${deleteTarget.id}`, { method: "DELETE" });
    const json = await res.json();
    setBusy(false);
    if (json.error) {
      toast.error(json.error.message);
      return;
    }
    onDeleted(deleteTarget.id);
    toast.success("Document deleted");
    setDeleteTarget(null);
  }

  if (docs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No documents yet. Upload your first file above.
      </p>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Added</TableHead>
            <TableHead className="w-32"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {docs.map((doc) => (
            <Fragment key={doc.id}>
              <TableRow>
                <TableCell className="font-medium">{doc.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {(doc.file_size_bytes / 1024 / 1024).toFixed(1)} MB
                </TableCell>
                <TableCell>
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-medium uppercase ${STATUS_BADGE[doc.status] ?? "bg-secondary"}`}
                  >
                    {doc.status}
                  </span>
                  {doc.status === "failed" && doc.error_message && (
                    <button
                      onClick={() => toggleError(doc.id)}
                      className="ml-2 text-xs text-destructive underline"
                    >
                      {expandedErrors.has(doc.id) ? "hide" : "details"}
                    </button>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(doc.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    {doc.status === "failed" && (
                      <Button variant="outline" size="sm" onClick={() => retry(doc)}>
                        Retry
                      </Button>
                    )}
                    {doc.status === "ready" && (
                      <Button variant="outline" size="sm" onClick={() => download(doc)}>
                        Download
                      </Button>
                    )}
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(doc)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
              {expandedErrors.has(doc.id) && doc.error_message && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700 font-mono">
                      {doc.error_message}
                    </p>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete document?</DialogTitle>
            <DialogDescription>
              &ldquo;{deleteTarget?.name}&rdquo; and all its chunks will be permanently deleted.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busy}>
              {busy ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
