"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

function getFileType(file: File): "pdf" | "docx" | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (
    name.endsWith(".docx") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "docx";
  return null;
}

export type DocRow = {
  id: string;
  name: string;
  file_type: string;
  file_size_bytes: number;
  file_url: string;
  status: string;
  error_message: string | null;
  created_at: string;
};

export function DropZone({ onUploaded }: { onUploaded: (doc: DocRow) => void }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const semaphore = useRef(0);
  const queue = useRef<File[]>([]);

  async function uploadFile(file: File, type: "pdf" | "docx") {
    // 1. Get signed upload URL + docId
    const urlRes = await fetch("/api/kb/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, size: file.size, type }),
    });
    const urlJson = await urlRes.json();
    if (urlJson.error) throw new Error(urlJson.error.message);
    const { docId, uploadUrl, path } = urlJson.data as {
      docId: string;
      uploadUrl: string;
      path: string;
    };

    // 2. PUT directly to Supabase Storage
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!putRes.ok) throw new Error("Storage upload failed");

    // 3. Register the doc row
    const docsRes = await fetch("/api/kb/docs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docId, name: file.name, size: file.size, type, path }),
    });
    const docsJson = await docsRes.json();
    if (docsJson.error) throw new Error(docsJson.error.message);

    return docsJson.data.doc as DocRow;
  }

  const processQueue = useCallback(() => {
    while (queue.current.length > 0 && semaphore.current < 3) {
      const file = queue.current.shift()!;
      const type = getFileType(file)!;
      semaphore.current += 1;

      uploadFile(file, type)
        .then((doc) => {
          toast.success(`${file.name} uploaded`);
          onUploaded(doc);
        })
        .catch((err: Error) => {
          toast.error(`${file.name}: ${err.message}`);
        })
        .finally(() => {
          semaphore.current -= 1;
          processQueue();
        });
    }
  }, [onUploaded]);

  const enqueue = useCallback((files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name}: exceeds 25 MB limit`);
        continue;
      }
      if (!getFileType(file)) {
        toast.error(`${file.name}: only PDF and DOCX files are supported`);
        continue;
      }
      queue.current.push(file);
    }
    processQueue();
  }, [processQueue]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    enqueue(e.dataTransfer.files);
  }, [enqueue]);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
        dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
      }`}
    >
      <p className="text-sm text-muted-foreground">
        Drag PDF or DOCX files here, or{" "}
        <span className="underline">click to browse</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Up to 25 MB per file · 3 uploads at a time
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.docx"
        className="hidden"
        onChange={(e) => e.target.files && enqueue(e.target.files)}
      />
    </div>
  );
}
