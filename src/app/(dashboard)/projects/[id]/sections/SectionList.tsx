"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RfpSection } from "@/types";

interface SectionDraft {
  id: string;
  title: string;
  rfp_content: string | null;
}

function SortableRow({
  section,
  onRename,
  onDelete,
}: {
  section: SectionDraft;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.id });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(section.title);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  function commitRename() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== section.title) onRename(section.id, trimmed);
    else setDraft(section.title);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg border bg-white px-3 py-2.5 shadow-sm"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-gray-300 hover:text-gray-500 touch-none"
        aria-label="Drag to reorder"
      >
        ⠿
      </button>

      {editing ? (
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") {
              setDraft(section.title);
              setEditing(false);
            }
          }}
          className="h-7 flex-1 text-sm"
        />
      ) : (
        <button
          className="flex-1 text-left text-sm hover:underline"
          onClick={() => setEditing(true)}
        >
          {section.title}
        </button>
      )}

      <button
        onClick={() => onDelete(section.id)}
        className="shrink-0 text-xs text-gray-400 hover:text-red-600"
        aria-label="Delete section"
      >
        ✕
      </button>
    </div>
  );
}

export function SectionList({
  initialSections,
  projectId,
}: {
  initialSections: RfpSection[];
  projectId: string;
}) {
  const router = useRouter();
  const [sections, setSections] = useState<SectionDraft[]>(
    initialSections.map((s) => ({
      id: s.id,
      title: s.title,
      rfp_content: s.rfp_content,
    }))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSections((prev) => {
        const oldIdx = prev.findIndex((s) => s.id === active.id);
        const newIdx = prev.findIndex((s) => s.id === over.id);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  }

  function handleRename(id: string, title: string) {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title } : s))
    );
  }

  function handleDelete(id: string) {
    setSections((prev) => prev.filter((s) => s.id !== id));
  }

  function handleAddSection() {
    const newSection: SectionDraft = {
      id: `new-${Date.now()}`,
      title: "New section",
      rfp_content: null,
    };
    setSections((prev) => [...prev, newSection]);
  }

  async function handleConfirm() {
    if (sections.length === 0) {
      setError("At least one section is required.");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/sections/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sections: sections.map((s, i) => ({
            title: s.title,
            rfp_content: s.rfp_content,
            position: i,
          })),
        }),
      });
      const json = await res.json() as {
        data: unknown;
        error: { code: string; message: string } | null;
      };
      if (!res.ok || json.error) {
        setError(json.error?.message ?? "Failed to save sections.");
        return;
      }
      router.push(`/projects/${projectId}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sections.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {sections.map((s) => (
              <SortableRow
                key={s.id}
                section={s}
                onRename={handleRename}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {sections.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8 rounded-lg border border-dashed">
          No sections. Add one below or go back and re-detect.
        </p>
      )}

      <button
        onClick={handleAddSection}
        className="w-full rounded-lg border-2 border-dashed py-2 text-sm text-muted-foreground hover:border-gray-400 hover:text-gray-600 transition-colors"
      >
        + Add section manually
      </button>

      {error && (
        <p className="text-sm text-red-600 rounded-md border border-red-200 bg-red-50 px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <Button onClick={handleConfirm} disabled={loading || sections.length === 0}>
          {loading ? "Saving…" : "Confirm & start generating →"}
        </Button>
      </div>
    </div>
  );
}
