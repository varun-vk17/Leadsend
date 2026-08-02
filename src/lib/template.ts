import { LeadData } from "@/types";

/**
 * Renders a template string by replacing {{placeholder}} tokens
 * with corresponding values from the lead data.
 */
export function renderTemplate(
  template: string,
  lead: LeadData,
  isPreview = false
): string {
  const firstName =
    lead.firstName?.trim() || (isPreview ? "John" : "there");
  const lastName = lead.lastName?.trim() || (isPreview ? "Doe" : "");
  const company =
    lead.company?.trim() || (isPreview ? "Ask Elephant" : "your company");
  const website = lead.website?.trim() || (isPreview ? "askelephant.ai" : "");
  const email = lead.email?.trim() || "";
  const fullName =
    [firstName, lastName].filter(Boolean).join(" ") || firstName;

  // Map of placeholder names to lead data fields
  const fieldMap: Record<string, string> = {
    first_name: firstName,
    last_name: lastName,
    email: email,
    company: company,
    website: website,
    full_name: fullName,
  };

  // Include any custom fields from lead data
  for (const [key, value] of Object.entries(lead)) {
    if (!(key in fieldMap)) {
      fieldMap[key] = value || "";
    }
  }

  // Replace all {{placeholder}} patterns
  let result = template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = fieldMap[key.toLowerCase()];
    if (value !== undefined) {
      return sanitize(value);
    }
    return match;
  });

  // Clean up any awkward spaces before punctuation if a field was empty
  result = result.replace(/\s+([.,!?])/g, "$1").replace(/ {2,}/g, " ");

  return result;
}

/**
 * Formats multi-line plain text body into valid HTML with preserved
 * line breaks, paragraphs, bullet points, numbered lists, indents, and spacing gaps.
 */
export function formatBodyToHtml(body: string): string {
  if (!body) return "";

  // If the body already contains block-level HTML tags, return as is
  if (/<(p|div|h[1-6]|ul|ol|li|blockquote|table|section)[^>]*>/i.test(body)) {
    return body;
  }

  const lines = body.split(/\r?\n/);
  const result: string[] = [];

  let currentListType: "ul" | "ol" | null = null;
  let inParagraph = false;
  let paragraphLines: string[] = [];

  const closeList = () => {
    if (currentListType) {
      result.push(currentListType === "ul" ? "</ul>" : "</ol>");
      currentListType = null;
    }
  };

  const closeParagraph = () => {
    if (inParagraph && paragraphLines.length > 0) {
      const content = paragraphLines.join("<br />");
      result.push(`<p style="margin: 0 0 1em 0; line-height: 1.6;">${content}</p>`);
      paragraphLines = [];
      inParagraph = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Blank / empty line handling
    if (trimmed === "") {
      if (inParagraph) {
        closeParagraph();
      } else if (currentListType) {
        closeList();
      } else {
        // Additional consecutive blank lines -> render vertical gap space
        result.push('<div style="height: 1em;"></div>');
      }
      continue;
    }

    // Bullet point list item: -, *, +, •, –, —
    const bulletMatch = rawLine.match(/^(\s*)([-*+•–—])\s*(.+)$/);
    // Numbered list item: 1., 2), 1-, 2:, etc.
    const numberMatch = rawLine.match(/^(\s*)(\d+[\.\)\-\:]?)\s*(.+)$/);

    if (bulletMatch) {
      closeParagraph();
      if (currentListType !== "ul") {
        closeList();
        result.push(
          '<ul style="margin: 0 0 1em 0; padding-left: 20px; list-style: none;">'
        );
        currentListType = "ul";
      }
      const indentSpaces = bulletMatch[1].length;
      const leadingNbsp = "&nbsp;".repeat(indentSpaces);
      const itemText = formatLineSpaces(bulletMatch[3]);
      result.push(
        `<li style="margin-bottom: 6px; line-height: 1.6;">${leadingNbsp}<span style="font-weight: bold; margin-right: 8px; color: inherit;">•</span>${itemText}</li>`
      );
    } else if (numberMatch) {
      closeParagraph();
      if (currentListType !== "ol") {
        closeList();
        result.push(
          '<ol style="margin: 0 0 1em 0; padding-left: 20px; list-style: none;">'
        );
        currentListType = "ol";
      }
      const indentSpaces = numberMatch[1].length;
      const leadingNbsp = "&nbsp;".repeat(indentSpaces);
      const rawNum = numberMatch[2];
      const numPrefix = rawNum.endsWith(".") || rawNum.endsWith(")") ? rawNum : `${rawNum}.`;
      const itemText = formatLineSpaces(numberMatch[3]);
      result.push(
        `<li style="margin-bottom: 6px; line-height: 1.6;">${leadingNbsp}<span style="font-weight: bold; margin-right: 8px; color: inherit;">${numPrefix}</span>${itemText}</li>`
      );
    } else {
      // Normal text line
      closeList();
      if (!inParagraph) {
        inParagraph = true;
      }
      paragraphLines.push(formatLineSpaces(rawLine));
    }
  }

  closeParagraph();
  closeList();

  const formattedHtml = result.join("");

  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: inherit; white-space: pre-wrap;">${formattedHtml}</div>`;
}

function formatLineSpaces(line: string): string {
  // Preserve leading indentation spaces with non-breaking spaces
  return line.replace(/^( +)/, (match) => "&nbsp;".repeat(match.length));
}

/**
 * Sanitize a string to prevent HTML injection in email content.
 */
function sanitize(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Extract all placeholder names from a template string.
 */
export function extractPlaceholders(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, "")))];
}
