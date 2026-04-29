"use client";

import Image from "next/image";
import { useState, useRef, ChangeEvent } from "react";

interface Slide {
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

interface GenerateResponse {
  slides?: Slide[];
  error?: string;
}

function resolveTemplateIndexForSlide(slide: Slide, templateCount: number): number {
  if (templateCount === 0) return -1;
  if (slide.slideType === "scripture" && templateCount > 1) return 1;
  return 0;
}

function resolveTemplateForSlide(slide: Slide, templateDataUrls: string[]): string | null {
  const index = resolveTemplateIndexForSlide(slide, templateDataUrls.length);
  return index >= 0 ? templateDataUrls[index] ?? null : null;
}

function toPx(percent: number, full: number): number {
  return Math.round((percent / 100) * full);
}

function getSlideLayout(slide: Slide): {
  titleBox: { x: number; y: number; width: number; height: number; align: "left" | "center" | "right" };
  bodyBox: { x: number; y: number; width: number; height: number; align: "left" | "center" | "right" };
  textColor: string;
  titleFontSize: number;
  bodyFontSize: number;
} {
  const defaultTitle = { x: 10, y: 10, width: 80, height: 14, align: "left" as const };
  const defaultBody = { x: 10, y: 28, width: 80, height: 54, align: "left" as const };
  const modelTitleBox = slide.layout?.titleBox
    ? {
        x: slide.layout.titleBox.x,
        y: slide.layout.titleBox.y,
        width: slide.layout.titleBox.width,
        height: slide.layout.titleBox.height,
        align: slide.layout.titleBox.align ?? "left",
      }
    : defaultTitle;

  const modelBodyBox = slide.layout?.bodyBox
    ? {
        x: slide.layout.bodyBox.x,
        y: slide.layout.bodyBox.y,
        width: slide.layout.bodyBox.width,
        height: slide.layout.bodyBox.height,
        align: slide.layout.bodyBox.align ?? "left",
      }
      : defaultBody;

  return {
    titleBox: modelTitleBox,
    bodyBox: modelBodyBox,
    textColor: slide.layout?.textColor ?? "#FFFFFF",
    titleFontSize: slide.layout?.titleFontSize ?? 60,
    bodyFontSize: slide.layout?.bodyFontSize ?? 40,
  };
}

function getTemplateRoleLabel(index: number): string {
  if (index === 0) return "Point template";
  if (index === 1) return "Scripture template";
  return `Additional template ${index + 1}`;
}

export default function Home() {
  const [presentationTitle, setPresentationTitle] = useState("");
  const [agentInstructions, setAgentInstructions] = useState("");
  const [styleGuideImageDataUrl, setStyleGuideImageDataUrl] = useState<string | null>(null);
  const [styleGuideFileName, setStyleGuideFileName] = useState<string | null>(null);
  const [styleGuideFileType, setStyleGuideFileType] = useState<"text" | "image" | null>(null);
  const [templateSlideImageDataUrls, setTemplateSlideImageDataUrls] = useState<string[]>([]);
  const [templateSlideFileNames, setTemplateSlideFileNames] = useState<string[]>([]);
  const [presentationNotes, setPresentationNotes] = useState("");
  const [presentationNotesFileDataUrl, setPresentationNotesFileDataUrl] = useState<string | null>(null);
  const [presentationNotesFileName, setPresentationNotesFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [downloading, setDownloading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const templateSlideInputRef = useRef<HTMLInputElement>(null);
  const notesFileInputRef = useRef<HTMLInputElement>(null);

  function readImageAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve((ev.target?.result as string) ?? "");
      reader.onerror = () => reject(new Error("Failed to read image file."));
      reader.readAsDataURL(file);
    });
  }

  function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStyleGuideFileName(file.name);
    const reader = new FileReader();

    if (file.type.startsWith("image/")) {
      reader.onload = (ev) => {
        setStyleGuideImageDataUrl((ev.target?.result as string) ?? null);
        setStyleGuideFileType("image");
      };
      reader.readAsDataURL(file);
      return;
    }

    reader.onload = (ev) => {
      setAgentInstructions((ev.target?.result as string) ?? "");
      setStyleGuideImageDataUrl(null);
      setStyleGuideFileType("text");
    };
    reader.readAsText(file);
  }

  async function handleTemplateSlidesUpload(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const pngFiles = files.filter(
      (file) => file.type === "image/png" || /\.png$/i.test(file.name)
    );

    if (pngFiles.length === 0) {
      setError("Template slides must be PNG files.");
      return;
    }

    try {
      const dataUrls = await Promise.all(pngFiles.map(readImageAsDataUrl));
      setTemplateSlideImageDataUrls(dataUrls);
      setTemplateSlideFileNames(pngFiles.map((file) => file.name));
      setError(null);
    } catch {
      setError("Failed to load template slide images.");
    }
  }

  function handleRemoveTemplateSlide(indexToRemove: number) {
    setTemplateSlideImageDataUrls((prev) => prev.filter((_, index) => index !== indexToRemove));
    setTemplateSlideFileNames((prev) => prev.filter((_, index) => index !== indexToRemove));
    setError(null);
  }

  function handleClearTemplateSlides() {
    setTemplateSlideImageDataUrls([]);
    setTemplateSlideFileNames([]);
    if (templateSlideInputRef.current) {
      templateSlideInputRef.current.value = "";
    }
    setError(null);
  }

  function handleNotesFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const isDocx =
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      /\.docx$/i.test(file.name);

    if (!isPdf && !isDocx) {
      setError("Notes file must be a PDF or DOCX.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setPresentationNotesFileDataUrl((ev.target?.result as string) ?? null);
      setPresentationNotesFileName(file.name);
      setError(null);
    };
    reader.onerror = () => {
      setError("Failed to read uploaded notes file.");
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSlides(null);
    setLoading(true);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presentationTitle,
          styleGuide: agentInstructions,
          styleGuideImageDataUrl,
          templateSlideImageDataUrls,
          presentationNotes,
          presentationNotesFileDataUrl,
        }),
      });
      const data: GenerateResponse = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? "Failed to generate slides.");
      } else {
        setSlides(data.slides ?? []);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function downloadPNGs() {
    if (!slides || slides.length === 0) return;
    setDownloading(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const W = 1920;
      const H = 1080;

      function wrapText(
        ctx: CanvasRenderingContext2D,
        text: string,
        maxWidth: number
      ): string[] {
        const words = text.split(" ");
        const lines: string[] = [];
        let current = "";
        for (const word of words) {
          const test = current ? `${current} ${word}` : word;
          if (ctx.measureText(test).width > maxWidth && current) {
            lines.push(current);
            current = word;
          } else {
            current = test;
          }
        }
        if (current) lines.push(current);
        return lines;
      }

      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        const layout = getSlideLayout(slide);
        const canvas = document.createElement("canvas");
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext("2d")!;

        const templateImageDataUrl = resolveTemplateForSlide(slide, templateSlideImageDataUrls);
        let templateImage: HTMLImageElement | null = null;
        if (templateImageDataUrl) {
          templateImage = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new window.Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("Failed to load template image."));
            img.src = templateImageDataUrl;
          });
        }

        // Background
        if (templateImage) {
          ctx.drawImage(templateImage, 0, 0, W, H);
        } else {
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, 0, W, H);
        }

        const titleX = toPx(layout.titleBox.x, W);
        const titleY = toPx(layout.titleBox.y, H);
        const titleW = toPx(layout.titleBox.width, W);
        const titleH = toPx(layout.titleBox.height, H);
        const bodyX = toPx(layout.bodyBox.x, W);
        const bodyY = toPx(layout.bodyBox.y, H);
        const bodyW = toPx(layout.bodyBox.width, W);
        const bodyH = toPx(layout.bodyBox.height, H);

        const resolvedTextColor = layout.textColor;
        const titleLineHeight = Math.round(layout.titleFontSize * 1.2);
        const bodyLineHeight = Math.round(layout.bodyFontSize * 1.2);

        ctx.textBaseline = "top";

        // Title
        if (slide.title) {
          ctx.fillStyle = resolvedTextColor;
          ctx.font = `bold ${layout.titleFontSize}px Arial`;
          ctx.textAlign = layout.titleBox.align;
          const titleLines = wrapText(ctx, slide.title, titleW);
          let currentY = titleY;
          for (const line of titleLines) {
            if (currentY + titleLineHeight > titleY + titleH) break;
            const drawX = layout.titleBox.align === "center"
              ? titleX + titleW / 2
              : layout.titleBox.align === "right"
                ? titleX + titleW
                : titleX;
            ctx.fillText(line, drawX, currentY);
            currentY += titleLineHeight;
          }
        }

        // Body
        if (slide.body) {
          ctx.fillStyle = resolvedTextColor;
          ctx.font = `${layout.bodyFontSize}px Arial`;
          ctx.textAlign = layout.bodyBox.align;
          const rawLines = slide.body.split("\n");
          let currentY = bodyY;
          for (const rawLine of rawLines) {
            const wrapped = wrapText(ctx, rawLine, bodyW);
            for (const line of wrapped) {
              if (currentY + bodyLineHeight > bodyY + bodyH) break;
              const drawX = layout.bodyBox.align === "center"
                ? bodyX + bodyW / 2
                : layout.bodyBox.align === "right"
                  ? bodyX + bodyW
                  : bodyX;
              ctx.fillText(line, drawX, currentY);
              currentY += bodyLineHeight;
            }
            if (currentY + bodyLineHeight > bodyY + bodyH) break;
          }
        }

        const blob = await new Promise<Blob>((resolve) =>
          canvas.toBlob((b) => resolve(b!), "image/png")
        );
        const num = String(i + 1).padStart(2, "0");
        zip.file(`slide_${num}.png`, blob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = (presentationTitle || "presentation").replace(/[^a-z0-9_\-]/gi, "_");
      a.download = `${safeName}_slides.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  async function downloadPro() {
    if (!slides || slides.length === 0) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/export-pro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presentationTitle,
          slides: slides.map((slide) => ({
            title: slide.title,
            body: slide.body,
            notes: slide.notes,
            layout: slide.layout,
          })),
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to export .pro file.");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = (presentationTitle || "presentation").replace(/[^a-z0-9_\-]/gi, "_");
      a.download = `${safeName}.pro`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export .pro file.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <header className="border-b border-white/10 px-6 py-4">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            🎬 ShowBuilder
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            AI-powered slide builder for ProPresenter
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Presentation Title */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-200">
              Presentation Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={presentationTitle}
              onChange={(e) => setPresentationTitle(e.target.value)}
              required
              placeholder="e.g. Sunday Service – Week 1"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-slate-500 outline-none ring-0 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Style Guide */}
            <div className="flex flex-col">
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-sm font-medium text-slate-200">
                  Agent Instructions
                  <span className="ml-1.5 text-xs text-slate-500">(optional)</span>
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-white/20"
                >
                  Upload file
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.json,.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>
              {styleGuideFileName && (
                <div className="mb-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-xs text-emerald-300">
                  <p>
                    Style guide uploaded: <span className="font-medium">{styleGuideFileName}</span>
                  </p>
                  <p className="mt-0.5 text-emerald-200/80">
                    {styleGuideFileType === "image"
                      ? "Image guide will be OCR-scanned during generation."
                      : "Text guide is loaded and ready."}
                  </p>
                </div>
              )}
              <textarea
                value={agentInstructions}
                onChange={(e) => setAgentInstructions(e.target.value)}
                placeholder={`Instructions for the AI agent — controls tone, formatting, and slide structure.\n\nExamples:\n- Dark background, white text\n- Title in bold, 60pt\n- Keep each slide to 3 lines max\n- Use a professional, concise tone\n- Avoid scripture references unless explicitly in the notes`}
                rows={10}
                className="flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
              />
              <div className="mt-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-200">
                    Template Slides
                    <span className="ml-1.5 text-xs text-slate-500">(PNG, optional)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => templateSlideInputRef.current?.click()}
                    className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-white/20"
                  >
                    Upload templates
                  </button>
                  <input
                    ref={templateSlideInputRef}
                    type="file"
                    accept=".png,image/png"
                    multiple
                    className="hidden"
                    onChange={handleTemplateSlidesUpload}
                  />
                </div>
                {templateSlideFileNames.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-500">
                        Loaded {templateSlideFileNames.length} template slide
                        {templateSlideFileNames.length === 1 ? "" : "s"}: {templateSlideFileNames.join(", ")}
                      </p>
                      <button
                        type="button"
                        onClick={handleClearTemplateSlides}
                        className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-medium text-slate-300 transition hover:bg-white/10"
                      >
                        Clear all
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {templateSlideImageDataUrls.map((dataUrl, index) => (
                        <div
                          key={`${templateSlideFileNames[index] ?? "template"}-${index}`}
                          className="relative overflow-hidden rounded-md border border-white/10 bg-black/40"
                        >
                          <button
                            type="button"
                            onClick={() => handleRemoveTemplateSlide(index)}
                            aria-label={`Remove template slide ${index + 1}`}
                            className="absolute right-1.5 top-1.5 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white transition hover:bg-black/90"
                          >
                            Remove
                          </button>
                          <Image
                            src={dataUrl}
                            alt={`Template slide ${index + 1}`}
                            width={240}
                            height={135}
                            unoptimized
                            className="h-20 w-full object-cover"
                          />
                          <div className="space-y-0.5 px-2 py-1">
                            <p className="truncate text-[10px] text-slate-300">
                              {templateSlideFileNames[index] ?? `Template ${index + 1}`}
                            </p>
                            <p className="text-[10px] font-medium uppercase tracking-wide text-cyan-300/90">
                              {getTemplateRoleLabel(index)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Presentation Notes */}
            <div className="flex flex-col">
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-200">
                  Presentation Notes / Content <span className="text-red-400">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => notesFileInputRef.current?.click()}
                  className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-white/20"
                >
                  Upload PDF/DOCX
                </button>
                <input
                  ref={notesFileInputRef}
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={handleNotesFileUpload}
                />
              </div>
              {presentationNotesFileName && (
                <div className="mb-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-xs text-emerald-300">
                  Notes document uploaded: <span className="font-medium">{presentationNotesFileName}</span>
                </div>
              )}
              <textarea
                value={presentationNotes}
                onChange={(e) => setPresentationNotes(e.target.value)}
                placeholder={`Paste notes here, or upload a PDF/DOCX file with sermon content and styles.\n\nExample:\n- Welcome and announcements\n- Scripture: John 3:16\n- Main message: God's love and grace\n- Three points: Faith, Hope, Love\n- Closing prayer and benediction`}
                rows={10}
                className="flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={
                loading ||
                !presentationTitle.trim() ||
                (!presentationNotes.trim() && !presentationNotesFileDataUrl)
              }
              className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Generating slides…" : "Generate Slides"}
            </button>
            {slides && slides.length > 0 && (
              <button
                type="button"
                onClick={downloadPro}
                disabled={downloading}
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-6 py-2.5 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
              >
                {downloading ? "Preparing .pro…" : "⬇ Download .pro"}
              </button>
            )}
            {slides && slides.length > 0 && (
              <button
                type="button"
                onClick={downloadPNGs}
                disabled={downloading}
                className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-6 py-2.5 text-sm font-semibold text-blue-300 transition hover:bg-blue-500/20 disabled:opacity-50"
              >
                {downloading ? "Generating PNGs…" : "⬇ Download PNGs"}
              </button>
            )}
          </div>
        </form>

        {/* Error */}
        {error && (
          <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Slide Preview */}
        {slides && slides.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 text-lg font-semibold text-white">
              Preview — {slides.length} slide{slides.length !== 1 ? "s" : ""} generated
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {slides.map((slide, i) => (
                <SlideCard
                  key={i}
                  slide={slide}
                  index={i}
                  templateImageDataUrl={resolveTemplateForSlide(slide, templateSlideImageDataUrls)}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function SlideCard({
  slide,
  index,
  templateImageDataUrl,
}: {
  slide: Slide;
  index: number;
  templateImageDataUrl: string | null;
}) {
  const [showNotes, setShowNotes] = useState(false);
  const layout = getSlideLayout(slide);
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-black shadow-lg">
      {/* Slide preview (16:9 aspect) */}
      <div
        className="relative flex flex-col items-start justify-start bg-black p-4"
        style={{ aspectRatio: "16/9" }}
      >
        {templateImageDataUrl && (
          <Image
            src={templateImageDataUrl}
            alt="Slide template background"
            fill
            unoptimized
            className="object-cover"
          />
        )}
        <div className="relative z-10 h-full w-full">
        <span className="mb-2 text-[10px] font-medium text-slate-600">
          {index + 1}
        </span>
        {slide.title && (
          <p
            className="absolute whitespace-pre-line text-base font-bold leading-snug"
            style={{
              left: `${layout.titleBox.x}%`,
              top: `${layout.titleBox.y}%`,
              width: `${layout.titleBox.width}%`,
              height: `${layout.titleBox.height}%`,
              color: layout.textColor,
              textAlign: layout.titleBox.align,
              fontSize: `${Math.max(10, Math.round(layout.titleFontSize / 5))}px`,
            }}
          >
            {slide.title}
          </p>
        )}
        {slide.body && (
          <p
            className="absolute whitespace-pre-line leading-relaxed"
            style={{
              left: `${layout.bodyBox.x}%`,
              top: `${layout.bodyBox.y}%`,
              width: `${layout.bodyBox.width}%`,
              height: `${layout.bodyBox.height}%`,
              color: layout.textColor,
              textAlign: layout.bodyBox.align,
              fontSize: `${Math.max(9, Math.round(layout.bodyFontSize / 5))}px`,
            }}
          >
            {slide.body}
          </p>
        )}
        </div>
      </div>
      {/* Presenter notes toggle */}
      {slide.notes && (
        <div className="border-t border-white/10 bg-slate-900/60 px-3 py-2">
          <button
            onClick={() => setShowNotes((v) => !v)}
            className="text-xs text-slate-500 hover:text-slate-300"
          >
            {showNotes ? "Hide notes ▲" : "Show notes ▼"}
          </button>
          {showNotes && (
            <p className="mt-1.5 text-xs text-slate-400 whitespace-pre-line">{slide.notes}</p>
          )}
        </div>
      )}
    </div>
  );
}

