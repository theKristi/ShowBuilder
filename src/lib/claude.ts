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
  const templateImagePayloadChars = templateImagesForModel.reduce((sum, url) => sum + url.length, 0);
  const canIncludeTemplateImages =
    templateImagesForModel.length > 0 && templateImagePayloadChars <= MAX_TEMPLATE_IMAGE_PAYLOAD_CHARS;
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

Structured Note Segments (ordered):
${segmentListText}

If template slide images are provided, use them as visual references for layout, spacing, typography hierarchy, and visual tone while preserving the provided content.${templateRules}${templateSizeNote}`;

    const buildUserContent = (includeTemplates: boolean): AnthropicContentBlock[] => {
      const content: AnthropicContentBlock[] = [{ type: "text", text: userMessage }];

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
        titleFontSize: 60,
        bodyFontSize: 40,
      },
    };
  });

  return { slides: normalizedSlides, fallbackTypes: [...fallbackTypes] };
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
