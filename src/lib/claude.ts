import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY environment variable is not set. Please add it to your .env.local file."
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

export interface ZoneBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TemplateZones = {
  title?: ZoneBox;
  body?: ZoneBox;
};

export type ZoneMap = Record<number, TemplateZones>;

export interface GeneratedSlide {
  title: string;
  body: string;
  notes?: string;
  slideType?: "point" | "scripture" | "other";
  layout?: {
    titleBox?: {
      x: number;
      y: number;
      width: number;
      height: number;
      align?: "left" | "center" | "right";
    };
    bodyBox?: {
      x: number;
      y: number;
      width: number;
      height: number;
      align?: "left" | "center" | "right";
    };
    textColor?: string;
    titleFontSize?: number;
    bodyFontSize?: number;
  };
}

export interface GenerateRequest {
  styleGuide: string;
  presentationNotes: string;
  presentationTitle: string;
  templateSlideImageDataUrls?: string[];
  styleGuideImageDataUrls?: string[];
  zoneMap?: ZoneMap;
}

export interface GenerateResult {
  slides: GeneratedSlide[];
  fallbackTypes: string[];
}

const STYLE_GUIDE_OCR_SYSTEM_PROMPT = `You are an OCR assistant.

Extract all readable text from the provided style guide image.
Rules:
- Preserve headings, bullet points, and line breaks where possible
- Do not add commentary
- If text is partially unreadable, keep only the readable text
- Return plain text only`;

const SLIDE_GENERATION_MODEL =
  process.env.ANTHROPIC_GENERATE_MODEL ?? "claude-sonnet-4-6";
const STYLE_GUIDE_OCR_MODEL =
  process.env.ANTHROPIC_OCR_MODEL ?? "claude-haiku-4-5-20251001";
const MAX_SEGMENT_BATCH_CHARS = 5500;
const MAX_STYLE_GUIDE_PROMPT_CHARS = 2500;
const MAX_TEMPLATE_IMAGE_PAYLOAD_CHARS = 120000;

const SYSTEM_PROMPT = `You are an expert presentation designer for ProPresenter, a live presentation software used in churches and live events.

Your task is to take the user's style guide and presentation notes and create a structured set of slides.

Rules:
- Create slides based on the presentation notes provided, using the highlighted note segments as the content for each slide
- Use ONLY wording from the provided highlighted note segments; do not add new facts, transitions, explanations, or commentary
- Do not paraphrase highlighted text; keep slide text as direct excerpts from the provided segments
- Follow the style guide instructions carefully
- Let the style guide and template visuals determine text structure for each slide:
  - If the design indicates a single text element, use one populated field (typically body) and leave the other empty
  - If the design indicates a heading + body treatment, split content across title/body using only words from the segment
  - Do not force a title when the style guide or template does not call for one
- Keep slide content brief — each slide should be easily readable at a glance
- Use simple, direct language appropriate for on-screen projection
- The caller may provide an exact required slide count; when provided, create exactly that many slides
- If notes include a section named "Parsed Highlighted Non-Scripture Points", create point-focused slides from those items and do not treat scripture references as points unless explicitly asked
- Classify each slide with a slideType value:
  - "point": teaching points, takeaways, application statements
  - "scripture": bible/book references or verse content
  - "other": everything else
- Return output as valid JSON only, as a single object with this exact shape: {"slides": [{"title": "string", "body": "string", "notes": "string", "slideType": "point|scripture|other"}]}`;

interface NoteSegment {
  text: string;
}

const BULLET_REGEX = /^\s*(?:[-*•]\s+|\d+[.)]\s+)(.+)$/;
const SCRIPTURE_REFERENCE_REGEX =
  /\b(?:[1-3]\s*)?[A-Za-z]{2,}\s+\d{1,3}:\d{1,3}(?:\s*[-–]\s*\d{1,3})?\b/i;

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function splitLongSegment(segmentText: string, maxChars = 260): string[] {
  const normalized = compactWhitespace(segmentText);
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const sentenceParts = normalized
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (sentenceParts.length <= 1) {
    const words = normalized.split(" ");
    const chunks: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maxChars && current) {
        chunks.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentenceParts) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > maxChars && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function collectBulletsFromSection(lines: string[], headerRegex: RegExp): string[] {
  const headerIndex = lines.findIndex((line) => headerRegex.test(line.trim()));
  if (headerIndex < 0) {
    return [];
  }

  const highlighted: string[] = [];
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;

    if (/^[A-Za-z][^.!?]{0,90}:$/.test(line) && !/^[-*•]\s+/.test(line)) {
      break;
    }

    const bulletMatch = line.match(BULLET_REGEX);
    if (bulletMatch?.[1]) {
      const bulletText = compactWhitespace(bulletMatch[1]);
      if (bulletText) {
        highlighted.push(...splitLongSegment(bulletText));
      }
    }
  }

  return highlighted;
}

function extractHighlightedOnlySegments(notes: string): string[] {
  const lines = notes.replace(/\r\n/g, "\n").split("\n");
  const pointHighlights = collectBulletsFromSection(
    lines,
    /^\s*Parsed Highlighted Non-Scripture Points\b/i
  );
  const scriptureHighlights = collectBulletsFromSection(
    lines,
    /^\s*Parsed Highlighted Scripture References\b/i
  );
  const highlighted = [...pointHighlights, ...scriptureHighlights];

  return highlighted;
}

function extractNoteSegments(notes: string): NoteSegment[] {
  const highlightedSegments = extractHighlightedOnlySegments(notes);
  if (highlightedSegments.length === 0) {
    return [];
  }

  const deduped: NoteSegment[] = [];
  const seen = new Set<string>();
  for (const segment of highlightedSegments) {
    const key = segment.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ text: segment });
  }

  return deduped.slice(0, 40);
}

function buildSlideTitleFromSegment(text: string): string {
  const words = compactWhitespace(text)
    .replace(/["'""''()\[\]{}]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 5);

  if (!words.length) {
    return "Key Point";
  }

  return words
    .map((word) => (word.length <= 3 ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1)))
    .join(" ");
}

function inferSlideTypeFromText(text: string): "point" | "scripture" | "other" {
  if (SCRIPTURE_REFERENCE_REGEX.test(text)) {
    return "scripture";
  }
  return "point";
}

function createFallbackSlideFromSegment(segment: NoteSegment): GeneratedSlide {
  const slideType = inferSlideTypeFromText(segment.text);
  return {
    title: buildSlideTitleFromSegment(segment.text),
    body: segment.text,
    notes: "Created from notes segment to preserve requested slide count.",
    slideType,
  };
}

function enforceSlideCountFromNotes(
  slides: GeneratedSlide[],
  segments: NoteSegment[],
  targetSlideCount: number
): GeneratedSlide[] {
  if (targetSlideCount <= 0) {
    return slides;
  }

  const safeSlides = slides.filter(
    (slide) => (slide.title && slide.title.trim().length > 0) || (slide.body && slide.body.trim().length > 0)
  );

  if (safeSlides.length >= targetSlideCount) {
    return safeSlides.slice(0, targetSlideCount);
  }

  const expanded = [...safeSlides];
  const fallbackSegments = segments.length ? segments : [{ text: "Key point" }];
  let index = 0;
  while (expanded.length < targetSlideCount) {
    const segment = fallbackSegments[index % fallbackSegments.length];
    expanded.push(createFallbackSlideFromSegment(segment));
    index += 1;
  }

  return expanded;
}

function partitionNoteSegments(segments: NoteSegment[], maxCharsPerBatch: number): NoteSegment[][] {
  if (segments.length === 0) return [];

  const batches: NoteSegment[][] = [];
  let currentBatch: NoteSegment[] = [];
  let currentChars = 0;

  for (const segment of segments) {
    const segmentChars = segment.text.length + 8;
    const wouldExceed = currentBatch.length > 0 && currentChars + segmentChars > maxCharsPerBatch;

    if (wouldExceed) {
      batches.push(currentBatch);
      currentBatch = [segment];
      currentChars = segmentChars;
    } else {
      currentBatch.push(segment);
      currentChars += segmentChars;
    }
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

function isPayloadTooLargeError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes("413") ||
    message.includes("request body too large") ||
    message.includes("request too large") ||
    message.includes("request entity too large") ||
    message.includes("max size")
  );
}

function isUnexpectedEndOfJsonError(err: unknown): boolean {
  return err instanceof SyntaxError && /unexpected end of json input/i.test(err.message);
}

function parseSlidesFromModelContent(content: string): GeneratedSlide[] {
  const tryParse = (value: string): GeneratedSlide[] | null => {
    try {
      const parsed = JSON.parse(value) as { slides?: GeneratedSlide[] };
      if (!Array.isArray(parsed.slides)) return null;
      return parsed.slides;
    } catch {
      return null;
    }
  };

  const direct = tryParse(content);
  if (direct) return direct;

  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const sliced = content.slice(firstBrace, lastBrace + 1);
    const extracted = tryParse(sliced);
    if (extracted) return extracted;
  }

  throw new SyntaxError("Unexpected end of JSON input");
}

function trimForPrompt(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}\n\n[Truncated for model input limits]`;
}

const CANVAS_W = 1920;
const CANVAS_H = 1080;
const TITLE_FONT_SIZE = 60;
const BODY_FONT_SIZE = 40;

function estimateCharLimit(widthPct: number, heightPct: number, fontSize: number): number {
  const avgCharWidth = fontSize * 0.55;
  const lineHeight = fontSize * 1.3;
  const charsPerLine = Math.floor((widthPct / 100) * CANVAS_W / avgCharWidth);
  const lines = Math.floor((heightPct / 100) * CANVAS_H / lineHeight);
  return Math.max(1, charsPerLine * Math.max(1, lines));
}

function buildZoneGuidance(zones: TemplateZones | undefined, label: string): string {
  if (!zones?.title && !zones?.body) return "";

  const lines: string[] = [`${label} text zone constraints (slide is ${CANVAS_W}×${CANVAS_H}px):`];

  if (zones.title) {
    const limit = estimateCharLimit(zones.title.width, zones.title.height, TITLE_FONT_SIZE);
    lines.push(
      `- Title box: ${zones.title.width}% wide × ${zones.title.height}% tall at ${TITLE_FONT_SIZE}pt → keep title under ${limit} characters (~${Math.ceil(limit / 5)} words)`
    );
  } else {
    lines.push("- No title zone defined — leave title empty.");
  }

  if (zones.body) {
    const limit = estimateCharLimit(zones.body.width, zones.body.height, BODY_FONT_SIZE);
    lines.push(
      `- Body box: ${zones.body.width}% wide × ${zones.body.height}% tall at ${BODY_FONT_SIZE}pt → keep body under ${limit} characters`
    );
  } else {
    lines.push("- No body zone defined — leave body empty.");
  }

  return lines.join("\n");
}

type AnthropicContentBlock = Anthropic.TextBlockParam | Anthropic.ImageBlockParam;

function parseImageDataUrl(
  dataUrl: string
): { mediaType: "image/png" | "image/jpeg" | "image/webp"; data: string } | null {
  const match = dataUrl.match(/^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/i);
  if (!match) return null;
  const rawType = match[1].toLowerCase();
  const mediaType = rawType === "image/jpg" ? "image/jpeg" : (rawType as "image/png" | "image/jpeg" | "image/webp");
  return { mediaType, data: match[2] };
}

export async function generateSlides(req: GenerateRequest): Promise<GenerateResult> {
  const anthropic = getAnthropicClient();
  const noteSegments = extractNoteSegments(req.presentationNotes);
  if (noteSegments.length === 0) {
    throw new Error(
      "No highlighted content found to generate slides. Please highlight the content in your DOCX so it appears under 'Parsed Highlighted Non-Scripture Points' or 'Parsed Highlighted Scripture References'."
    );
  }
  const targetSlideCount = Math.max(1, Math.min(noteSegments.length || 1, 40));
  const segmentBatches = partitionNoteSegments(noteSegments, MAX_SEGMENT_BATCH_CHARS);
  const templateImagesForModel = (req.templateSlideImageDataUrls ?? []).slice(0, 2);
  const styleGuideImagesForModel = (req.styleGuideImageDataUrls ?? []).slice(0, 6);
  const templateImagePayloadChars = templateImagesForModel.reduce((sum, url) => sum + url.length, 0);
  const styleGuideImagePayloadChars = styleGuideImagesForModel.reduce((sum, url) => sum + url.length, 0);
  const canIncludeTemplateImages =
    templateImagesForModel.length > 0 && templateImagePayloadChars + styleGuideImagePayloadChars <= MAX_TEMPLATE_IMAGE_PAYLOAD_CHARS;
  const trimmedStyleGuide = trimForPrompt(req.styleGuide ?? "", MAX_STYLE_GUIDE_PROMPT_CHARS);

  const systemPrompt = trimmedStyleGuide
    ? `${SYSTEM_PROMPT}\n\nAgent Instructions from user:\n${trimmedStyleGuide}`
    : SYSTEM_PROMPT;
  const batches =
    segmentBatches.length > 0
      ? segmentBatches
      : [[{ text: "Key point" }]];
  const pendingBatches: NoteSegment[][] = [...batches];
  const batchSlides: GeneratedSlide[] = [];
  let allowTemplateImages = canIncludeTemplateImages;
  let processedBatchCount = 0;

  while (pendingBatches.length > 0) {
    const batch = pendingBatches.shift()!;
    const segmentListText = batch.map((segment, index) => `${index + 1}. ${segment.text}`).join("\n");
    const batchSlideCount = Math.max(1, batch.length);
    const includeTemplatesForBatch = allowTemplateImages && processedBatchCount === 0;

    const hasPointTemplate = includeTemplatesForBatch && Boolean(templateImagesForModel[0]);
    const hasScriptureTemplate = includeTemplatesForBatch && Boolean(templateImagesForModel[1]);
    const templateRules = hasPointTemplate || hasScriptureTemplate
      ? `
Template rules:
- Template slide 1 is the Point background.
- Template slide 2 is the Scripture Reference background.
- For point slides, set slideType to "point".
- For scripture/book-chapter-verse slides, set slideType to "scripture".
- If uncertain, set slideType to "other".`
      : "";

    const templateSizeNote =
      !canIncludeTemplateImages && templateImagesForModel.length > 0 && processedBatchCount === 0
        ? "\n\nTemplate images were omitted for this request because they exceed model input-size limits."
        : "";

    const pointZoneGuidance = buildZoneGuidance(req.zoneMap?.[0], "Point slide");
    const scriptureZoneGuidance = buildZoneGuidance(req.zoneMap?.[1], "Scripture slide");
    const zoneGuidanceSection = [pointZoneGuidance, scriptureZoneGuidance]
      .filter(Boolean)
      .join("\n\n");

    const userMessage = `Presentation Title: ${req.presentationTitle}

Batch ${processedBatchCount + 1}

Required Slide Count for this batch: ${batchSlideCount}

Slide Count Rules:
- Create exactly ${batchSlideCount} slides for this batch.
- Use the note segments in order, with one primary segment per slide.
- Do not merge multiple segments into one slide unless required by very short/duplicate content.

Content Constraints:
- Use only text that appears in the Structured Note Segments listed below.
- Do not introduce any new wording beyond those segments.
- Keep each slide tied to its primary segment text.
${zoneGuidanceSection ? `\n${zoneGuidanceSection}\n- Text MUST fit within the character limits above — trim or split the segment if needed to stay within bounds.` : ""}
Structured Note Segments (ordered):
${segmentListText}

If template slide images are provided, use them as visual references for layout, spacing, typography hierarchy, and visual tone while preserving the provided content.${templateRules}${templateSizeNote}`;

    const buildUserContent = (includeTemplates: boolean): AnthropicContentBlock[] => {
      const content: AnthropicContentBlock[] = [{ type: "text", text: userMessage }];

      if (styleGuideImagesForModel.length > 0) {
        content.push({ type: "text", text: "Style guide (use these pages as the visual design reference — match colors, fonts, text placement, and layout shown):" });
        styleGuideImagesForModel.forEach((imageDataUrl, index) => {
          const parsed = parseImageDataUrl(imageDataUrl);
          if (!parsed) return;
          content.push({ type: "text", text: `Style guide page ${index + 1}:` });
          content.push({
            type: "image",
            source: { type: "base64", media_type: parsed.mediaType, data: parsed.data },
          });
        });
      }

      if (includeTemplates) {
        templateImagesForModel.forEach((imageDataUrl, index) => {
          const parsed = parseImageDataUrl(imageDataUrl);
          if (!parsed) return;
          content.push({ type: "text", text: `Template slide ${index + 1}:` });
          content.push({
            type: "image",
            source: { type: "base64", media_type: parsed.mediaType, data: parsed.data },
          });
        });
      }

      return content;
    };

    const runRequest = async (includeTemplates: boolean) =>
      anthropic.messages.create({
        model: SLIDE_GENERATION_MODEL,
        system: systemPrompt,
        messages: [{ role: "user", content: buildUserContent(includeTemplates) }],
        temperature: 0.7,
        max_tokens: 4096,
      });

    let response: Awaited<ReturnType<typeof runRequest>>;
    try {
      response = await runRequest(includeTemplatesForBatch);
    } catch (err) {
      if (includeTemplatesForBatch && isPayloadTooLargeError(err)) {
        allowTemplateImages = false;
        response = await runRequest(false);
      } else if (isPayloadTooLargeError(err) && batch.length > 1) {
        const mid = Math.ceil(batch.length / 2);
        pendingBatches.unshift(batch.slice(mid));
        pendingBatches.unshift(batch.slice(0, mid));
        continue;
      } else {
        throw err;
      }
    }

    const content = response.content[0]?.type === "text" ? response.content[0].text : null;
    if (!content) {
      throw new Error("No response received from Anthropic.");
    }

    let parsedSlides: GeneratedSlide[];
    try {
      parsedSlides = parseSlidesFromModelContent(content);
    } catch (err) {
      if ((isUnexpectedEndOfJsonError(err) || err instanceof SyntaxError) && batch.length > 1) {
        const mid = Math.ceil(batch.length / 2);
        pendingBatches.unshift(batch.slice(mid));
        pendingBatches.unshift(batch.slice(0, mid));
        continue;
      }

      if ((isUnexpectedEndOfJsonError(err) || err instanceof SyntaxError) && batch.length === 1) {
        batchSlides.push(createFallbackSlideFromSegment(batch[0]));
        processedBatchCount += 1;
        continue;
      }

      throw err;
    }

    batchSlides.push(...enforceSlideCountFromNotes(parsedSlides, batch, batchSlideCount));
    processedBatchCount += 1;
  }

  const constrainedSlides = enforceSlideCountFromNotes(batchSlides, noteSegments, targetSlideCount);

  const fallbackTypes = new Set<string>();

  const normalizedSlides = constrainedSlides.map((slide) => {
    const normalizedType =
      slide.slideType === "point" || slide.slideType === "scripture" || slide.slideType === "other"
        ? slide.slideType
        : "other";

    const templateIndex = normalizedType === "scripture" ? 1 : 0;
    const zones = req.zoneMap?.[templateIndex];

    const defaultLayout = normalizedType === "scripture"
      ? {
          titleBox: { x: 10, y: 12, width: 80, height: 16, align: "center" as const },
          bodyBox: { x: 12, y: 34, width: 76, height: 46, align: "center" as const },
        }
      : {
          titleBox: { x: 10, y: 10, width: 80, height: 14, align: "left" as const },
          bodyBox: { x: 10, y: 28, width: 80, height: 54, align: "left" as const },
        };

    const titleBox = zones?.title
      ? { ...zones.title, align: defaultLayout.titleBox.align }
      : defaultLayout.titleBox;

    const bodyBox = zones?.body
      ? { ...zones.body, align: defaultLayout.bodyBox.align }
      : defaultLayout.bodyBox;

    if (!zones?.title && !zones?.body) {
      fallbackTypes.add(normalizedType);
    }

    return {
      ...slide,
      slideType: normalizedType,
      layout: {
        titleBox,
        bodyBox,
        textColor: "#FFFFFF",
        titleFontSize: TITLE_FONT_SIZE,
        bodyFontSize: BODY_FONT_SIZE,
      },
    };
  });

  return { slides: normalizedSlides, fallbackTypes: [...fallbackTypes] };
}

// ==========================================
// Agent Dialogue Types & Functions
// ==========================================

export interface AgentChatMessage {
  role: "user" | "agent";
  content: string;
}

export interface StyleReviewResult {
  message: string;
  sampleSlides: GeneratedSlide[];
}

export interface AgentChatResult {
  message: string;
  updatedSlides?: GeneratedSlide[];
}

export interface NotesAnalysisResult {
  message: string;
}

export interface SlideReviewResult {
  message: string;
}

function buildDefaultLayoutForSlideType(
  slideType: "point" | "scripture" | "other",
  zoneMap?: ZoneMap
): NonNullable<GeneratedSlide["layout"]> {
  const templateIndex = slideType === "scripture" ? 1 : 0;
  const zones = zoneMap?.[templateIndex];

  const defaultLayout =
    slideType === "scripture"
      ? {
          titleBox: { x: 10, y: 12, width: 80, height: 16, align: "center" as const },
          bodyBox: { x: 12, y: 34, width: 76, height: 46, align: "center" as const },
        }
      : {
          titleBox: { x: 10, y: 10, width: 80, height: 14, align: "left" as const },
          bodyBox: { x: 10, y: 28, width: 80, height: 54, align: "left" as const },
        };

  const titleBox = zones?.title
    ? { ...zones.title, align: defaultLayout.titleBox.align }
    : defaultLayout.titleBox;

  const bodyBox = zones?.body
    ? { ...zones.body, align: defaultLayout.bodyBox.align }
    : defaultLayout.bodyBox;

  return {
    titleBox,
    bodyBox,
    textColor: "#FFFFFF",
    titleFontSize: TITLE_FONT_SIZE,
    bodyFontSize: BODY_FONT_SIZE,
  };
}

export async function analyzeStyleGuideForSamples(params: {
  styleGuide: string;
  styleGuideImageDataUrl?: string;
  styleGuideImageDataUrls?: string[];
  templateSlideImageDataUrls?: string[];
  presentationTitle: string;
  zoneMap?: ZoneMap;
}): Promise<StyleReviewResult> {
  const anthropic = getAnthropicClient();

  const systemPrompt = `You are a presentation design assistant for ProPresenter.

Analyze the provided style guide, agent instructions, and any template slide images. Then generate exactly 2 representative sample slides:
- One "point" type slide demonstrating a typical teaching point
- One "scripture" type slide demonstrating a typical Bible verse/reference

Use realistic placeholder content appropriate for a church presentation. Match the visual style closely: if the guide says no titles, leave title empty; match text density and tone.

Respond ONLY with valid JSON (no markdown fencing):
{
  "message": "2-3 sentences describing what you understood about the presentation style",
  "sampleSlides": [
    {"title": "string", "body": "string", "slideType": "point", "notes": ""},
    {"title": "string", "body": "string", "slideType": "scripture", "notes": ""}
  ]
}`;

  const userContent: AnthropicContentBlock[] = [
    {
      type: "text",
      text: `Presentation Title: ${params.presentationTitle}\n\nStyle Guide / Instructions:\n${params.styleGuide || "(None provided)"}`,
    },
  ];

  if (params.styleGuideImageDataUrl) {
    const parsed = parseImageDataUrl(params.styleGuideImageDataUrl);
    if (parsed) {
      userContent.push({ type: "text", text: "Style guide image:" });
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: parsed.mediaType, data: parsed.data },
      });
    }
  }

  const pdfStyleGuideImages = (params.styleGuideImageDataUrls ?? []).slice(0, 6);
  if (pdfStyleGuideImages.length > 0) {
    userContent.push({ type: "text", text: "Style guide PDF (match the visual design shown — colors, fonts, text placement, and layout):" });
    pdfStyleGuideImages.forEach((url, i) => {
      const parsed = parseImageDataUrl(url);
      if (!parsed) return;
      userContent.push({ type: "text", text: `Style guide page ${i + 1}:` });
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: parsed.mediaType, data: parsed.data },
      });
    });
  }

  (params.templateSlideImageDataUrls ?? []).slice(0, 2).forEach((url, i) => {
    const parsed = parseImageDataUrl(url);
    if (!parsed) return;
    userContent.push({ type: "text", text: `Template ${i + 1} (${i === 0 ? "Point" : "Scripture"}):` });
    userContent.push({
      type: "image",
      source: { type: "base64", media_type: parsed.mediaType, data: parsed.data },
    });
  });

  const zoneLines: string[] = [];
  [0, 1].forEach((i) => {
    const zones = params.zoneMap?.[i];
    if (zones) {
      const g = buildZoneGuidance(zones, i === 0 ? "Point slide" : "Scripture slide");
      if (g) zoneLines.push(g);
    }
  });
  if (zoneLines.length > 0) {
    userContent.push({ type: "text", text: zoneLines.join("\n\n") });
  }

  const response = await anthropic.messages.create({
    model: SLIDE_GENERATION_MODEL,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
    temperature: 0.7,
    max_tokens: 1500,
  });

  const rawContent = response.content[0]?.type === "text" ? response.content[0].text : null;
  if (!rawContent) throw new Error("No response from agent.");

  try {
    const firstBrace = rawContent.indexOf("{");
    const lastBrace = rawContent.lastIndexOf("}");
    const parsed = JSON.parse(rawContent.slice(firstBrace, lastBrace + 1)) as {
      message?: string;
      sampleSlides?: Array<{ title?: string; body?: string; slideType?: string; notes?: string }>;
    };

    const sampleSlides: GeneratedSlide[] = (parsed.sampleSlides ?? []).map((s) => {
      const slideType = (s.slideType === "scripture" ? "scripture" : "point") as "point" | "scripture";
      return {
        title: s.title ?? "",
        body: s.body ?? "",
        notes: s.notes ?? "",
        slideType,
        layout: buildDefaultLayoutForSlideType(slideType, params.zoneMap),
      };
    });

    return {
      message: parsed.message ?? "Here are sample slides based on your style guide.",
      sampleSlides,
    };
  } catch {
    return { message: rawContent, sampleSlides: [] };
  }
}

export async function chatInStyleReview(
  messages: AgentChatMessage[],
  context: {
    styleGuide: string;
    presentationTitle: string;
    currentSampleSlides: GeneratedSlide[];
    zoneMap?: ZoneMap;
  }
): Promise<AgentChatResult> {
  const anthropic = getAnthropicClient();

  const systemPrompt = `You are a presentation design assistant for ProPresenter.

Context:
- Presentation title: ${context.presentationTitle}
- Style guide: ${context.styleGuide || "(None provided)"}

Current sample slides:
${JSON.stringify(context.currentSampleSlides, null, 2)}

The user is reviewing sample slides and giving style feedback. Your job:
1. Respond conversationally to acknowledge their feedback.
2. ALWAYS return updatedSlides reflecting any changes — even minor ones like wording, capitalization, or content structure. If the user makes any suggestion about style, tone, content, layout, or wording, regenerate both sample slides incorporating that feedback.
3. Only omit updatedSlides if the user is asking a question with no style change implied (e.g. "what font is this?").

Respond ONLY with valid JSON (no markdown):
{
  "message": "your conversational response",
  "updatedSlides": [
    {"title": "string", "body": "string", "slideType": "point", "notes": ""},
    {"title": "string", "body": "string", "slideType": "scripture", "notes": ""}
  ]
}`;

  const firstUserIdx = messages.findIndex((m) => m.role === "user");
  const trimmedMessages = firstUserIdx >= 0 ? messages.slice(firstUserIdx) : messages;

  const anthropicMessages: Anthropic.MessageParam[] = trimmedMessages.map((msg) => ({
    role: msg.role === "user" ? ("user" as const) : ("assistant" as const),
    content: msg.content,
  }));

  const response = await anthropic.messages.create({
    model: SLIDE_GENERATION_MODEL,
    system: systemPrompt,
    messages: anthropicMessages,
    temperature: 0.7,
    max_tokens: 2000,
  });

  const rawContent = response.content[0]?.type === "text" ? response.content[0].text : null;
  if (!rawContent) throw new Error("No response from agent.");

  try {
    const firstBrace = rawContent.indexOf("{");
    const lastBrace = rawContent.lastIndexOf("}");
    const parsed = JSON.parse(rawContent.slice(firstBrace, lastBrace + 1)) as {
      message?: string;
      updatedSlides?: GeneratedSlide[];
    };

    const updatedSlides = parsed.updatedSlides?.map((s) => {
      const slideType = (
        s.slideType === "scripture" ? "scripture" : s.slideType === "other" ? "other" : "point"
      ) as "point" | "scripture" | "other";
      return {
        ...s,
        slideType,
        layout: s.layout ?? buildDefaultLayoutForSlideType(slideType, context.zoneMap),
      };
    });

    return { message: parsed.message ?? rawContent, updatedSlides };
  } catch {
    return { message: rawContent };
  }
}

export async function analyzeNotesForClarification(params: {
  presentationNotes: string;
  presentationTitle: string;
  styleSummary?: string;
}): Promise<NotesAnalysisResult> {
  const anthropic = getAnthropicClient();

  const systemPrompt = `You are a presentation assistant helping prepare sermon/presentation notes for slide creation in ProPresenter.

Your task:
1. Read the presentation notes carefully
2. Identify what content is marked for slides (look for "Parsed Highlighted Non-Scripture Points" and "Parsed Highlighted Scripture References" sections, or any highlighted/starred items)
3. Identify any content in the notes that seems important but is NOT marked for slides
4. Ask the user 1-3 specific clarifying questions about content inclusion

Be conversational and specific. Reference exact phrases from the notes when asking. If all content looks well-organized, say so and confirm what will be turned into slides.

Respond as plain text — this is a conversational message, not JSON.`;

  const notesPreview = params.presentationNotes.slice(0, 3500);
  const truncated = params.presentationNotes.length > 3500 ? "\n\n[Notes truncated for preview]" : "";

  const response = await anthropic.messages.create({
    model: SLIDE_GENERATION_MODEL,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Presentation Title: ${params.presentationTitle}\n\n${
          params.styleSummary ? `Style context: ${params.styleSummary}\n\n` : ""
        }Presentation Notes:\n${notesPreview}${truncated}`,
      },
    ],
    temperature: 0.7,
    max_tokens: 800,
  });

  const message =
    response.content[0]?.type === "text"
      ? response.content[0].text.trim()
      : "I've reviewed your notes. Everything looks good — shall we proceed to generate the slides?";

  return { message };
}

export async function chatInNotesClarification(
  messages: AgentChatMessage[],
  context: { presentationTitle: string }
): Promise<AgentChatResult> {
  const anthropic = getAnthropicClient();

  const systemPrompt = `You are a presentation assistant helping clarify presentation notes for slide generation.

Presentation title: ${context.presentationTitle}

Answer questions, confirm decisions, and note what should be included or excluded. When the user is ready to proceed, acknowledge that you have everything you need. Keep responses concise.

Respond as plain text — conversational, not JSON.`;

  const anthropicMessages: Anthropic.MessageParam[] = messages.map((msg) => ({
    role: msg.role === "user" ? ("user" as const) : ("assistant" as const),
    content: msg.content,
  }));

  const response = await anthropic.messages.create({
    model: SLIDE_GENERATION_MODEL,
    system: systemPrompt,
    messages: anthropicMessages,
    temperature: 0.7,
    max_tokens: 500,
  });

  const message =
    response.content[0]?.type === "text" ? response.content[0].text.trim() : "Got it!";
  return { message };
}

export async function reviewGeneratedSlides(params: {
  slides: GeneratedSlide[];
  styleGuide: string;
  presentationTitle: string;
}): Promise<SlideReviewResult> {
  const anthropic = getAnthropicClient();

  const systemPrompt = `You are a quality reviewer for church/event presentation slides in ProPresenter.

Review the generated slides against the style guide and provide a brief report:
1. Overall quality (1 sentence)
2. Any specific slides that don't match the expected style (cite by slide number and title)
3. One concrete suggestion if applicable

Keep the review to 3-5 sentences. Be encouraging but honest.`;

  const slideSummary = params.slides
    .slice(0, 20)
    .map(
      (s, i) =>
        `Slide ${i + 1} (${s.slideType}): title="${s.title}" body="${s.body.slice(0, 80)}${s.body.length > 80 ? "…" : ""}"`
    )
    .join("\n");

  const response = await anthropic.messages.create({
    model: SLIDE_GENERATION_MODEL,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Presentation: ${params.presentationTitle}\nStyle Guide: ${params.styleGuide || "(None)"}\n\nGenerated Slides:\n${slideSummary}`,
      },
    ],
    temperature: 0.5,
    max_tokens: 400,
  });

  const message =
    response.content[0]?.type === "text" ? response.content[0].text.trim() : "Slides look good!";
  return { message };
}

export async function extractStyleGuideTextFromImage(imageDataUrl: string): Promise<string> {
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(imageDataUrl)) {
    throw new Error("Unsupported style guide image format. Please use PNG, JPG, or WebP.");
  }

  const parsed = parseImageDataUrl(imageDataUrl);
  if (!parsed) {
    throw new Error("Could not parse style guide image data URL.");
  }

  const anthropic = getAnthropicClient();

  const response = await anthropic.messages.create({
    model: STYLE_GUIDE_OCR_MODEL,
    system: STYLE_GUIDE_OCR_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Extract the style guide text from this image." },
          {
            type: "image",
            source: { type: "base64", media_type: parsed.mediaType, data: parsed.data },
          },
        ],
      },
    ],
    temperature: 0,
    max_tokens: 1200,
  });

  const extractedText = response.content[0]?.type === "text" ? response.content[0].text.trim() : null;
  if (!extractedText) {
    throw new Error("Could not read text from style guide image.");
  }

  return extractedText;
}

const ZONE_DETECTION_SYSTEM_PROMPT = `You are analyzing a presentation slide background/template image for ProPresenter, a live presentation tool used in churches and live events.

Your job is to find where text should be overlaid on this template: a "title" region and/or a "body" region.

Rules:
- Only propose a region over empty/open space in the design — never over faces, logos, or busy graphic elements.
- Coordinates are percentages of the full image: x/y is the top-left corner (0-100), width/height are the box size as a percentage of image width/height.
- Leave at least 4-6% margin from the image edges so text isn't clipped.
- If the design clearly has separate heading and body treatments (different sizes/positions), return both title and body as non-overlapping boxes, with body positioned below or after the title.
- If the design has only one clear open text area, return only "body" and set "title" to null.
- If no area looks intended for text, return both as null.
- Respond ONLY with valid JSON, no markdown fencing: {"title": {"x":n,"y":n,"width":n,"height":n} | null, "body": {"x":n,"y":n,"width":n,"height":n} | null}`;

function clampZonePercent(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function sanitizeZoneBox(box: unknown): ZoneBox | undefined {
  if (!box || typeof box !== "object") return undefined;
  const candidate = box as Partial<ZoneBox>;
  if (
    typeof candidate.x !== "number" ||
    typeof candidate.y !== "number" ||
    typeof candidate.width !== "number" ||
    typeof candidate.height !== "number"
  ) {
    return undefined;
  }

  const width = clampZonePercent(candidate.width, 5, 100);
  const height = clampZonePercent(candidate.height, 5, 100);
  const x = clampZonePercent(candidate.x, 0, 100 - width);
  const y = clampZonePercent(candidate.y, 0, 100 - height);

  return { x, y, width, height };
}

function parseZoneDetectionResponse(content: string): TemplateZones {
  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error("Could not parse zone detection response.");
  }

  const parsed = JSON.parse(content.slice(firstBrace, lastBrace + 1)) as {
    title?: unknown;
    body?: unknown;
  };

  return {
    title: sanitizeZoneBox(parsed.title),
    body: sanitizeZoneBox(parsed.body),
  };
}

/**
 * Uses vision to propose title/body text zones for a template image, so the
 * user can start from a suggestion instead of drawing zones from scratch.
 */
export async function detectTemplateZones(params: {
  imageDataUrl: string;
  styleGuide?: string;
}): Promise<TemplateZones> {
  const parsed = parseImageDataUrl(params.imageDataUrl);
  if (!parsed) {
    throw new Error("Could not parse template image data URL.");
  }

  const anthropic = getAnthropicClient();

  const userText = params.styleGuide
    ? `Style guide / design instructions for context:\n${trimForPrompt(params.styleGuide, 1200)}\n\nAnalyze this template image and identify the text zones.`
    : "Analyze this template image and identify the text zones.";

  const response = await anthropic.messages.create({
    model: SLIDE_GENERATION_MODEL,
    system: ZONE_DETECTION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: userText },
          { type: "image", source: { type: "base64", media_type: parsed.mediaType, data: parsed.data } },
        ],
      },
    ],
    temperature: 0,
    max_tokens: 400,
  });

  const rawContent = response.content[0]?.type === "text" ? response.content[0].text.trim() : null;
  if (!rawContent) {
    throw new Error("No response from zone detection.");
  }

  return parseZoneDetectionResponse(rawContent);
}
