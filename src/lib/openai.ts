import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.GITHUB_TOKEN;
    if (!apiKey) {
      throw new Error(
        "GITHUB_TOKEN environment variable is not set. Please add it to your .env.local file."
      );
    }
    client = new OpenAI({
      apiKey,
      baseURL: "https://models.inference.ai.azure.com",
    });
  }
  return client;
}

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
}

const STYLE_GUIDE_OCR_SYSTEM_PROMPT = `You are an OCR assistant.

Extract all readable text from the provided style guide image.
Rules:
- Preserve headings, bullet points, and line breaks where possible
- Do not add commentary
- If text is partially unreadable, keep only the readable text
- Return plain text only`;

const SLIDE_GENERATION_MODEL =
  process.env.OPENAI_GENERATE_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const STYLE_GUIDE_OCR_MODEL = process.env.OPENAI_OCR_MODEL ?? "gpt-4.1-mini";
const MAX_SEGMENT_BATCH_CHARS = 5500;
const MAX_STYLE_GUIDE_PROMPT_CHARS = 2500;
const MAX_TEMPLATE_IMAGE_PAYLOAD_CHARS = 120000;

function assertSupportedGitHubModel(model: string, settingName: string): void {
  if (/claude|anthropic/i.test(model)) {
    throw new Error(
      `${settingName} is set to \"${model}\", but Anthropic Claude models are not available for the current GitHub Models token/provider. Use an available model such as \"gpt-4.1-mini\".`
    );
  }
}

const SYSTEM_PROMPT = `You are an expert presentation designer for ProPresenter, a live presentation software used in churches and live events.

Your task is to take the user's style guide and presentation notes and create a structured set of slides.

Rules:
- Create slides based on the presentation notes provided, using the highlighted note segments as the content for each slide
- Follow the style guide instructions carefully
- Keep slide content brief — each slide should be easily readable at a glance
- Use simple, direct language appropriate for on-screen projection
- The caller may provide an exact required slide count; when provided, create exactly that many slides
- Each slide title should be based on a portion of highlighted content from the notes.
- If notes include a section named "Parsed Highlighted Non-Scripture Points", create point-focused slides from those items and do not treat scripture references as points unless explicitly asked
- Classify each slide with a slideType value:
  - "point": teaching points, takeaways, application statements
  - "scripture": bible/book references or verse content
  - "other": everything else
- Provide a layout object for each slide with percentage-based text boxes so text can be positioned on top of template rectangles
- Coordinates must be in percentages from 0 to 100
- Keep text boxes inside slide bounds
- If template rectangles are visible, place titleBox/bodyBox to match those rectangles
- If no clear rectangle exists, use a readable default centered region
- Include align for titleBox/bodyBox when relevant

Respond ONLY with valid JSON in this exact format, with no additional text or markdown:
{
  "slides": [
    {
      "title": "Slide Title",
      "body": "Slide body text.\nSecond line if needed.",
      "notes": "Optional presenter notes for this slide.",
      "slideType": "point",
      "layout": {
        "titleBox": { "x": 10, "y": 12, "width": 80, "height": 14, "align": "left" },
        "bodyBox": { "x": 10, "y": 30, "width": 80, "height": 52, "align": "left" },
        "textColor": "#FFFFFF",
        "titleFontSize": 60,
        "bodyFontSize": 40
      }
    }
  ]
}`;

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
    .replace(/["'“”‘’()\[\]{}]/g, "")
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
  return message.includes("413") || message.includes("request body too large") || message.includes("max size");
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

export async function generateSlides(req: GenerateRequest): Promise<GeneratedSlide[]> {
  assertSupportedGitHubModel(SLIDE_GENERATION_MODEL, "OPENAI_GENERATE_MODEL");

  const openai = getOpenAIClient();
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

Structured Note Segments (ordered):
${segmentListText}

If template slide images are provided, use them as visual references for layout, spacing, typography hierarchy, and visual tone while preserving the provided content.${templateRules}${templateSizeNote}`;

    const buildUserContent = (includeTemplates: boolean): Array<OpenAI.Chat.Completions.ChatCompletionContentPart> => {
      const content: Array<OpenAI.Chat.Completions.ChatCompletionContentPart> = [{ type: "text", text: userMessage }];

      if (includeTemplates) {
        templateImagesForModel.forEach((imageDataUrl, index) => {
          content.push({ type: "text", text: `Template slide ${index + 1}:` });
          content.push({ type: "image_url", image_url: { url: imageDataUrl } });
        });
      }

      return content;
    };

    const runRequest = async (includeTemplates: boolean) =>
      openai.chat.completions.create({
        model: SLIDE_GENERATION_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: buildUserContent(includeTemplates) },
        ],
        temperature: 0.7,
        max_tokens: 4096,
        response_format: { type: "json_object" },
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

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response received from OpenAI.");
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

  const normalizedSlides = constrainedSlides.map((slide) => {
    const normalizedType =
      slide.slideType === "point" || slide.slideType === "scripture" || slide.slideType === "other"
        ? slide.slideType
        : "other";

    const titleBox = slide.layout?.titleBox;
    const bodyBox = slide.layout?.bodyBox;

    const normalizePercent = (value: unknown, fallback: number): number => {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(0, Math.min(100, n));
    };

    const normalizeBox = (
      box: typeof titleBox,
      fallback: { x: number; y: number; width: number; height: number; align: "left" | "center" | "right" }
    ) => {
      if (!box) return fallback;
      const x = normalizePercent(box.x, fallback.x);
      const y = normalizePercent(box.y, fallback.y);
      const width = normalizePercent(box.width, fallback.width);
      const height = normalizePercent(box.height, fallback.height);
      const align = box.align === "left" || box.align === "center" || box.align === "right"
        ? box.align
        : fallback.align;
      return { x, y, width, height, align };
    };

    const defaultLayout = normalizedType === "scripture"
      ? {
          titleBox: { x: 10, y: 12, width: 80, height: 16, align: "center" as const },
          bodyBox: { x: 12, y: 34, width: 76, height: 46, align: "center" as const },
        }
      : {
          titleBox: { x: 10, y: 10, width: 80, height: 14, align: "left" as const },
          bodyBox: { x: 10, y: 28, width: 80, height: 54, align: "left" as const },
        };

    const titleFontSize = typeof slide.layout?.titleFontSize === "number"
      ? Math.max(20, Math.min(140, slide.layout.titleFontSize))
      : 60;
    const bodyFontSize = typeof slide.layout?.bodyFontSize === "number"
      ? Math.max(16, Math.min(110, slide.layout.bodyFontSize))
      : 40;

    return {
      ...slide,
      slideType: normalizedType,
      layout: {
        titleBox: normalizeBox(titleBox, defaultLayout.titleBox),
        bodyBox: normalizeBox(bodyBox, defaultLayout.bodyBox),
        textColor: slide.layout?.textColor ?? "#FFFFFF",
        titleFontSize,
        bodyFontSize,
      },
    };
  });

  return normalizedSlides;
}

export async function extractStyleGuideTextFromImage(imageDataUrl: string): Promise<string> {
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(imageDataUrl)) {
    throw new Error("Unsupported style guide image format. Please use PNG, JPG, or WebP.");
  }

  assertSupportedGitHubModel(STYLE_GUIDE_OCR_MODEL, "OPENAI_OCR_MODEL");

  const openai = getOpenAIClient();

  const response = await openai.chat.completions.create({
    model: STYLE_GUIDE_OCR_MODEL,
    temperature: 0,
    max_tokens: 1200,
    messages: [
      { role: "system", content: STYLE_GUIDE_OCR_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Extract the style guide text from this image." },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
  });

  const extractedText = response.choices[0]?.message?.content?.trim();
  if (!extractedText) {
    throw new Error("Could not read text from style guide image.");
  }

  return extractedText;
}
