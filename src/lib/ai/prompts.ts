export function buildGenerationPrompt({
  orgName,
  industry,
  kbChunks,
  sectionTitle,
  rfpContent,
  customInstruction,
}: {
  orgName: string;
  industry: string;
  kbChunks: string[];
  sectionTitle: string;
  rfpContent: string;
  customInstruction?: string;
}): { system: string; user: string } {
  const system = `You are a senior proposal writer for ${orgName}, a company in the ${industry} sector.
Your role is to write a compelling, accurate response to a specific section of an RFP.
Use the tone, terminology, and examples found in the reference material provided.
Do not invent technical specifications, team credentials, pricing, or claims not explicitly supported by the reference material.
Write in first-person plural (we, our team).
Respond with only the proposal text — no meta-commentary, no headings.`;

  const referenceBlock =
    kbChunks.length > 0
      ? `<reference_material>\n${kbChunks.map((c, i) => `[${i + 1}] ${c}`).join("\n\n")}\n</reference_material>`
      : "<reference_material>No reference material available.</reference_material>";

  const instruction = customInstruction ? `\n\nAdditional instruction: ${customInstruction}` : "";

  const user = `${referenceBlock}

<rfp_section>
Section title: ${sectionTitle}

${rfpContent}
</rfp_section>

Write the proposal response for this section.${instruction}`;

  return { system, user };
}

export function buildSectionDetectionPrompt(rfpText: string): string {
  return `You are analyzing an RFP document to extract its sections.

<rfp_document>
${rfpText}
</rfp_document>

Return a JSON array of sections. Each section should have:
- "title": the section name (concise, e.g. "Technical Approach & Methodology")
- "rfp_content": the full text of that section's requirements

Return ONLY the JSON array, no other text. Example format:
[
  {"title": "Company Overview", "rfp_content": "Describe your company..."},
  {"title": "Technical Approach", "rfp_content": "Explain your methodology..."}
]`;
}
