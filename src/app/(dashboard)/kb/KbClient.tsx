"use client";

import { useEffect, useRef, useState } from "react";
import { DropZone } from "./DropZone";
import type { DocRow } from "./DropZone";
import { DocsTable } from "./DocsTable";

function hasActive(docs: DocRow[]) {
  return docs.some((d) => d.status === "queued" || d.status === "processing");
}

export function KbClient({
  initialDocs,
  canManage,
}: {
  initialDocs: DocRow[];
  canManage: boolean;
}) {
  const [docs, setDocs] = useState<DocRow[]>(initialDocs);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startPolling() {
    if (pollingRef.current) return;
    pollingRef.current = setInterval(async () => {
      const res = await fetch("/api/kb/docs");
      const json = await res.json();
      if (json.data) {
        setDocs(json.data as DocRow[]);
        if (!hasActive(json.data as DocRow[])) {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
        }
      }
    }, 2000);
  }

  useEffect(() => {
    if (hasActive(docs)) startPolling();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleUploaded(doc: DocRow) {
    setDocs((prev) => [doc, ...prev]);
    startPolling();
  }

  function handleRetried(id: string) {
    setDocs((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: "queued", error_message: null } : d))
    );
    startPolling();
  }

  function handleDeleted(id: string) {
    setDocs((prev) => prev.filter((d) => d.id !== id));
  }

  return (
    <div className="space-y-6">
      <DropZone onUploaded={handleUploaded} />
      <DocsTable
        docs={docs}
        canManage={canManage}
        onRetried={handleRetried}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
