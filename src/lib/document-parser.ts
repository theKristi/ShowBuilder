import JSZip from "jszip";
import pdfParse from "pdf-parse";

export interface ParsedNotesResult {
  notesText: string;
  parsingSummary?: string;
}

const SCRIPTURE_REFERENCE_REGEX = /\b(?:gen(?:esis)?|ex(?:odus)?|lev(?:iticus)?|num(?:bers)?|deut(?:eronomy)?|josh(?:ua)?|judg(?:es)?|ruth|1\s*sam(?:uel)?|2\s*sam(?:uel)?|1\s*kgs?|2\s*kgs?|1\s*chr(?:onicles)?|2\s*chr(?:onicles)?|ezra|neh(?:emiah)?|esth(?:er)?|job|ps(?:alm|alms)?|prov(?:erbs)?|eccl(?:esiastes)?|song\s*of\s*sol(?:omon)?|isa(?:iah)?|jer(?:emiah)?|lam(?:entations)?|ezek(?:iel)?|dan(?:iel)?|hos(?:ea)?|joel|amos|obad(?:iah)?|jonah|mic(?:ah)?|nah(?:um)?|hab(?:akkuk)?|zeph(?:aniah)?|hag(?:gai)?|zech(?:ariah)?|mal(?:achi)?|matt?(?:hew)?|mark|luke|john|acts|rom(?:ans)?|1\s*cor(?:inthians)?|2\s*cor(?:inthians)?|gal(?:atians)?|eph(?:esians)?|phil(?:ippians)?|col(?:ossians)?|1\s*thess(?:alonians)?|2\s*thess(?:alonians)?|1\s*tim(?:othy)?|2\s*tim(?:othy)?|titus|philem(?:on)?|heb(?:rews)?|james|1\s*pet(?:er)?|2\s*pet(?:er)?|1\s*john|2\s*john|3\s*john|jude|rev(?:elation)?)\s+\d{1,3}:\d{1,3}(?:\s*[-–]\s*\d{1,3})?\b/i;

function decodeBase64DataUrl(dataUrl: string, expectedMimeRegex: RegExp): Buffer {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid upload format.");
  }

  const mime = match[1] ?? "";
  if (!expectedMimeRegex.test(mime)) {
    throw new Error("Unsupported file type. Please upload a PDF or DOCX file.");
  }

  return Buffer.from(match[2] ?? "", "base64");
}

function xmlDecode(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function stripXmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, "");
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function normalizeHighlightedText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractDocxTextAndHighlights(xml: string): { fullText: string; highlightedText: string[] } {
  const paragraphMatches = xml.match(/<w:p[\s\S]*?<\/w:p>/g) ?? [];
  const lines: string[] = [];
  const highlighted: string[] = [];

  for (const paragraph of paragraphMatches) {
    const runMatches = paragraph.match(/<w:r[\s\S]*?<\/w:r>/g) ?? [];
    let paragraphText = "";
    let highlightedBuffer = "";

    const flushHighlightedBuffer = () => {
      const normalized = normalizeHighlightedText(highlightedBuffer);
      if (normalized) {
        highlighted.push(normalized);
      }
      highlightedBuffer = "";
    };

    for (const run of runMatches) {
      const highlightValue = run.match(/<w:highlight\b[^>]*w:val="([^"]+)"/i)?.[1]?.toLowerCase();
      const hasHighlight = /<w:highlight\b/i.test(run) && highlightValue !== "none";
      const textParts = run.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) ?? [];
      let runText = textParts
        .map((part) => xmlDecode(stripXmlTags(part)))
        .join("");

      if (/<w:tab\s*\/>/i.test(run)) {
        runText += "\t";
      }

      if (/<w:br\s*\/>/i.test(run)) {
        runText += "\n";
      }

      paragraphText += runText;

      if (hasHighlight) {
        highlightedBuffer += runText;
      } else if (highlightedBuffer) {
        flushHighlightedBuffer();
      }
    }

    if (highlightedBuffer) {
      flushHighlightedBuffer();
    }

    if (paragraphText.trim()) {
      lines.push(paragraphText.trim());
    }
  }

  return {
    fullText: lines.join("\n"),
    highlightedText: unique(highlighted),
  };
}

async function parseDocxNotes(dataUrl: string): Promise<ParsedNotesResult> {
  const fileBuffer = decodeBase64DataUrl(
    dataUrl,
    /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$/i
  );

  const zip = await JSZip.loadAsync(fileBuffer);
  const documentXmlFile = zip.file("word/document.xml");
  if (!documentXmlFile) {
    throw new Error("Could not read DOCX content.");
  }

  const xml = await documentXmlFile.async("string");
  const { fullText, highlightedText } = extractDocxTextAndHighlights(xml);

  const highlightedScripture = highlightedText.filter((line) => SCRIPTURE_REFERENCE_REGEX.test(line));
  const highlightedNonScripture = highlightedText.filter(
    (line) => !SCRIPTURE_REFERENCE_REGEX.test(line)
  );

  const nonScriptureSection = highlightedNonScripture.length
    ? `\n\nParsed Highlighted Non-Scripture Points (prioritize these as point slides):\n${highlightedNonScripture
        .map((line) => `- ${line}`)
        .join("\n")}`
    : "";

  const scriptureSection = highlightedScripture.length
    ? `\n\nParsed Highlighted Scripture References:\n${highlightedScripture
        .map((line) => `- ${line}`)
        .join("\n")}`
    : "";

  const hasHighlights = highlightedNonScripture.length > 0 || highlightedScripture.length > 0;
  const notesText = hasHighlights
    ? `${nonScriptureSection}${scriptureSection}`.trim()
    : fullText;

  const totalHighlighted = highlightedNonScripture.length + highlightedScripture.length;
  const summaryParts: string[] = [];
  if (highlightedNonScripture.length > 0) {
    summaryParts.push(
      `${highlightedNonScripture.length} highlighted non-scripture item${highlightedNonScripture.length === 1 ? "" : "s"}`
    );
  }
  if (highlightedScripture.length > 0) {
    summaryParts.push(
      `${highlightedScripture.length} highlighted scripture item${highlightedScripture.length === 1 ? "" : "s"}`
    );
  }

  return {
    notesText,
    parsingSummary: totalHighlighted
      ? `DOCX parsed with ${summaryParts.join(" and ")}. Full body text omitted because highlighted content was found.`
      : "DOCX parsed. No highlighted items found.",
  };
}

async function parsePdfNotes(dataUrl: string): Promise<ParsedNotesResult> {
  const fileBuffer = decodeBase64DataUrl(dataUrl, /^application\/pdf$/i);
  const pdf = await pdfParse(fileBuffer);
  const notesText = (pdf.text ?? "").trim();

  if (!notesText) {
    throw new Error("No readable text found in uploaded PDF.");
  }

  return {
    notesText,
    parsingSummary:
      "PDF parsed as plain text. Highlighted styling is not reliably available from PDF parsing.",
  };
}

export async function parsePresentationNotesFile(fileDataUrl: string): Promise<ParsedNotesResult> {
  if (fileDataUrl.startsWith("data:application/pdf;")) {
    return parsePdfNotes(fileDataUrl);
  }

  if (
    fileDataUrl.startsWith(
      "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;"
    )
  ) {
    return parseDocxNotes(fileDataUrl);
  }

  throw new Error("Unsupported notes file type. Please upload PDF or DOCX.");
}
