"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";

interface Props {
  content: string;
  editable: boolean;
  onChange: (html: string) => void;
}

function normalizeContent(content: string): string {
  if (!content) return "";
  return content.trimStart().startsWith("<") ? content : `<p>${content}</p>`;
}

type ToolbarButton = {
  label: string;
  title: string;
  action: () => void;
  isActive: () => boolean;
};

export function TiptapEditor({ content, editable, onChange }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, underline: false }),
      Underline,
    ],
    content: normalizeContent(content),
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class:
          "focus:outline-none text-sm leading-relaxed p-3 min-h-[200px] [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-2 [&_h3]:font-semibold [&_h3]:mt-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-4 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:font-mono [&_code]:text-xs [&_pre]:font-mono [&_pre]:text-xs [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:rounded",
      },
    },
  });

  if (!editor) return (
    <div className="flex flex-col flex-1 border rounded-md overflow-hidden bg-background">
      <div className="border-b bg-muted/50 px-2 py-1 h-8 shrink-0" />
      <div className="flex-1 min-h-[200px]" />
    </div>
  );

  const groups: ToolbarButton[][] = [
    [
      {
        label: "H1",
        title: "Heading 1",
        action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
        isActive: () => editor.isActive("heading", { level: 1 }),
      },
      {
        label: "H2",
        title: "Heading 2",
        action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        isActive: () => editor.isActive("heading", { level: 2 }),
      },
      {
        label: "H3",
        title: "Heading 3",
        action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        isActive: () => editor.isActive("heading", { level: 3 }),
      },
    ],
    [
      {
        label: "B",
        title: "Bold",
        action: () => editor.chain().focus().toggleBold().run(),
        isActive: () => editor.isActive("bold"),
      },
      {
        label: "I",
        title: "Italic",
        action: () => editor.chain().focus().toggleItalic().run(),
        isActive: () => editor.isActive("italic"),
      },
      {
        label: "U",
        title: "Underline",
        action: () => editor.chain().focus().toggleUnderline().run(),
        isActive: () => editor.isActive("underline"),
      },
      {
        label: "S",
        title: "Strikethrough",
        action: () => editor.chain().focus().toggleStrike().run(),
        isActive: () => editor.isActive("strike"),
      },
    ],
    [
      {
        label: "•",
        title: "Bullet list",
        action: () => editor.chain().focus().toggleBulletList().run(),
        isActive: () => editor.isActive("bulletList"),
      },
      {
        label: "1.",
        title: "Ordered list",
        action: () => editor.chain().focus().toggleOrderedList().run(),
        isActive: () => editor.isActive("orderedList"),
      },
    ],
    [
      {
        label: "❝",
        title: "Blockquote",
        action: () => editor.chain().focus().toggleBlockquote().run(),
        isActive: () => editor.isActive("blockquote"),
      },
      {
        label: "</>",
        title: "Code block",
        action: () => editor.chain().focus().toggleCodeBlock().run(),
        isActive: () => editor.isActive("codeBlock"),
      },
    ],
    [
      {
        label: "↩",
        title: "Undo",
        action: () => editor.chain().focus().undo().run(),
        isActive: () => false,
      },
      {
        label: "↪",
        title: "Redo",
        action: () => editor.chain().focus().redo().run(),
        isActive: () => false,
      },
    ],
  ];

  return (
    <div className="flex flex-col flex-1 border rounded-md overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 flex-wrap border-b bg-muted/50 px-2 py-1 shrink-0">
        {groups.map((group, gi) => (
          <span key={gi} className="flex items-center gap-0.5">
            {gi > 0 && (
              <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            )}
            {group.map((btn) => (
              <button
                key={btn.label}
                type="button"
                title={btn.title}
                onClick={btn.action}
                className={`px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${
                  btn.isActive()
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent text-muted-foreground hover:text-foreground"
                }`}
              >
                {btn.label}
              </button>
            ))}
          </span>
        ))}
      </div>

      {/* Editor */}
      <EditorContent
        editor={editor}
        className="flex-1 overflow-y-auto"
      />
    </div>
  );
}
