import { Document, Packer, Paragraph, TextRun, HeadingLevel, UnderlineType } from "docx";

export interface ExportSection {
  title: string;
  final_content: string | null;
  ai_draft: string | null;
  position: number;
}

export async function buildProposalDocx(
  projectTitle: string,
  sections: ExportSection[]
): Promise<Blob> {
  const sorted = [...sections].sort((a, b) => a.position - b.position);
  const children: Paragraph[] = [
    new Paragraph({ text: projectTitle, heading: HeadingLevel.HEADING_1 }),
  ];

  for (const section of sorted) {
    children.push(
      new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_2 })
    );
    const content = section.final_content ?? section.ai_draft;
    if (!content) continue;
    children.push(...contentToParagraphs(content));
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBlob(doc);
}

function contentToParagraphs(content: string): Paragraph[] {
  if (!content.trimStart().startsWith("<")) {
    return content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => new Paragraph({ children: [new TextRun(line)] }));
  }
  const parser = new DOMParser();
  const dom = parser.parseFromString(content, "text/html");
  return blocksToParagraphs(dom.body.childNodes);
}

function blocksToParagraphs(nodes: NodeList): Paragraph[] {
  const result: Paragraph[] = [];
  nodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) result.push(new Paragraph({ children: [new TextRun(text)] }));
      return;
    }
    const el = node as Element;
    const tag = el.tagName?.toUpperCase();
    switch (tag) {
      case "P":
        result.push(new Paragraph({ children: inlineRuns(el) }));
        break;
      case "H1":
        result.push(new Paragraph({ children: inlineRuns(el), heading: HeadingLevel.HEADING_1 }));
        break;
      case "H2":
        result.push(new Paragraph({ children: inlineRuns(el), heading: HeadingLevel.HEADING_2 }));
        break;
      case "H3":
        result.push(new Paragraph({ children: inlineRuns(el), heading: HeadingLevel.HEADING_3 }));
        break;
      case "UL":
        el.querySelectorAll(":scope > li").forEach((li) => {
          result.push(new Paragraph({ children: inlineRuns(li), bullet: { level: 0 } }));
        });
        break;
      case "OL": {
        let idx = 1;
        el.querySelectorAll(":scope > li").forEach((li) => {
          result.push(
            new Paragraph({
              children: [new TextRun(`${idx}. `), ...inlineRuns(li)],
            })
          );
          idx++;
        });
        break;
      }
      case "BLOCKQUOTE":
        result.push(
          new Paragraph({ children: inlineRuns(el), indent: { left: 720 } })
        );
        break;
      case "PRE": {
        const code = el.querySelector("code");
        const raw = code?.textContent ?? el.textContent ?? "";
        const lines = raw.split("\n");
        if (lines[lines.length - 1] === "") lines.pop();
        lines.forEach((line) => {
          result.push(
            new Paragraph({
              children: [new TextRun({ text: line, font: { name: "Courier New" } })],
            })
          );
        });
        break;
      }
      default:
        result.push(...blocksToParagraphs(el.childNodes));
    }
  });
  return result;
}

interface RunStyle {
  bold?: boolean;
  italics?: boolean;
  underline?: { type?: (typeof UnderlineType)[keyof typeof UnderlineType] };
  strike?: boolean;
  font?: { name: string };
}

function inlineRuns(el: Element | Node, inherited: RunStyle = {}): TextRun[] {
  const runs: TextRun[] = [];
  el.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? "";
      if (text) runs.push(new TextRun({ text, ...inherited }));
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const c = child as Element;
    const style: RunStyle = { ...inherited };
    switch (c.tagName?.toUpperCase()) {
      case "STRONG": case "B": style.bold = true; break;
      case "EM": case "I": style.italics = true; break;
      case "U": style.underline = { type: UnderlineType.SINGLE }; break;
      case "S": case "DEL": style.strike = true; break;
      case "CODE": style.font = { name: "Courier New" }; break;
    }
    runs.push(...inlineRuns(c, style));
  });
  return runs;
}
