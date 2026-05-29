"use client";

import Image from "next/image";
import { useEffect, useState, useRef, ChangeEvent } from "react";

type BoxAlign = "left" | "center" | "right";

interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
  align?: BoxAlign;
}

interface SlideLayout {
  titleBox?: LayoutBox;
  bodyBox?: LayoutBox;
  textColor?: string;
  titleFontSize?: number;
  bodyFontSize?: number;
}

interface ResolvedSlideLayout {
  titleBox: LayoutBox & { align: BoxAlign };
  bodyBox: LayoutBox & { align: BoxAlign };
  textColor: string;
  titleFontSize: number;
  bodyFontSize: number;
}

type SlideBoxKey = "titleBox" | "bodyBox";
type BoxInteractionMode = "move" | "resize-nw" | "resize-ne" | "resize-sw" | "resize-se";

interface Slide {
  title: string;
  body: string;
  notes?: string;
  slideType?: "point" | "scripture" | "other";
  showTitle?: boolean;
  showBody?: boolean;
  layout?: SlideLayout;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizeBox(box: LayoutBox | undefined, defaults: LayoutBox): Required<LayoutBox> {
  const width = roundPercent(clamp(box?.width ?? defaults.width, 5, 100));
  const height = roundPercent(clamp(box?.height ?? defaults.height, 5, 100));
  const x = roundPercent(clamp(box?.x ?? defaults.x, 0, 100 - width));
  const y = roundPercent(clamp(box?.y ?? defaults.y, 0, 100 - height));

  return {
    x,
    y,
    width,
    height,
    align: box?.align ?? defaults.align ?? "left",
  };
}

function buildEditableLayout(layout?: SlideLayout): ResolvedSlideLayout {
  const defaultTitle = { x: 10, y: 10, width: 80, height: 14, align: "left" as const };
  const defaultBody = { x: 10, y: 28, width: 80, height: 54, align: "left" as const };

  return {
    titleBox: normalizeBox(layout?.titleBox, defaultTitle),
    bodyBox: normalizeBox(layout?.bodyBox, defaultBody),
    textColor: layout?.textColor ?? "#FFFFFF",
    titleFontSize: clamp(layout?.titleFontSize ?? 60, 18, 180),
    bodyFontSize: clamp(layout?.bodyFontSize ?? 40, 18, 180),
  };
}

function adjustBoxFromInteraction(
  box: LayoutBox & { align: BoxAlign },
  mode: BoxInteractionMode,
  deltaXPercent: number,
  deltaYPercent: number
): LayoutBox & { align: BoxAlign } {
  const minWidth = 5;
  const minHeight = 5;
  const startRight = box.x + box.width;
  const startBottom = box.y + box.height;

  if (mode === "move") {
    return {
      ...box,
      x: roundPercent(clamp(box.x + deltaXPercent, 0, 100 - box.width)),
      y: roundPercent(clamp(box.y + deltaYPercent, 0, 100 - box.height)),
    };
  }

  if (mode === "resize-nw") {
    const x = roundPercent(clamp(box.x + deltaXPercent, 0, startRight - minWidth));
    const y = roundPercent(clamp(box.y + deltaYPercent, 0, startBottom - minHeight));
    return {
      ...box,
      x,
      y,
      width: roundPercent(startRight - x),
      height: roundPercent(startBottom - y),
    };
  }

  if (mode === "resize-ne") {
    const right = roundPercent(clamp(startRight + deltaXPercent, box.x + minWidth, 100));
    const y = roundPercent(clamp(box.y + deltaYPercent, 0, startBottom - minHeight));
    return {
      ...box,
      y,
      width: roundPercent(right - box.x),
      height: roundPercent(startBottom - y),
    };
  }

  if (mode === "resize-sw") {
    const x = roundPercent(clamp(box.x + deltaXPercent, 0, startRight - minWidth));
    const bottom = roundPercent(clamp(startBottom + deltaYPercent, box.y + minHeight, 100));
    return {
      ...box,
      x,
      width: roundPercent(startRight - x),
      height: roundPercent(bottom - box.y),
    };
  }

  const right = roundPercent(clamp(startRight + deltaXPercent, box.x + minWidth, 100));
  const bottom = roundPercent(clamp(startBottom + deltaYPercent, box.y + minHeight, 100));
  return {
    ...box,
    width: roundPercent(right - box.x),
    height: roundPercent(bottom - box.y),
  };
}

function getSlideLayout(slide: Slide): ResolvedSlideLayout {
  return buildEditableLayout(slide.layout);
}

function getTemplateRoleLabel(index: number): string {
  if (index === 0) return "Point template";
  if (index === 1) return "Scripture template";
  return `Additional template ${index + 1}`;
}

function hasSlideText(slide: Slide, field: "title" | "body"): boolean {
  return slide[field].trim().length > 0;
}

function isSlideTextVisible(slide: Slide, field: "title" | "body"): boolean {
  if (!hasSlideText(slide, field)) return false;
  return field === "title" ? slide.showTitle !== false : slide.showBody !== false;
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
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
  const [approvedSlides, setApprovedSlides] = useState<boolean[]>([]);
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
        const nextSlides = (data.slides ?? []).map((slide) => ({
          ...slide,
          showTitle: hasSlideText(slide, "title"),
          showBody: hasSlideText(slide, "body"),
          layout: buildEditableLayout(slide.layout),
        }));
        setSlides(nextSlides);
        setSelectedSlideIndex(0);
        setApprovedSlides(nextSlides.map(() => false));
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

        const showTitle = isSlideTextVisible(slide, "title");
        const showBody = isSlideTextVisible(slide, "body");
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
        if (showTitle) {
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
        if (showBody) {
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
            title: isSlideTextVisible(slide, "title") ? slide.title : "",
            body: isSlideTextVisible(slide, "body") ? slide.body : "",
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

  function updateSlideLayout(index: number, nextLayout: SlideLayout) {
    setSlides((currentSlides) => {
      if (!currentSlides) return currentSlides;
      return currentSlides.map((slide, slideIndex) =>
        slideIndex === index
          ? {
              ...slide,
              layout: buildEditableLayout(nextLayout),
            }
          : slide
      );
    });

    setApprovedSlides((currentApprovals) =>
      currentApprovals.map((approved, slideIndex) => (slideIndex === index ? false : approved))
    );
  }

  function updateSlideBox(
    index: number,
    boxKey: "titleBox" | "bodyBox",
    field: keyof LayoutBox,
    rawValue: string
  ) {
    const parsedValue = field === "align" ? rawValue : Number(rawValue);
    if (field !== "align" && Number.isNaN(parsedValue)) return;

    const currentSlide = slides?.[index];
    if (!currentSlide) return;

    const currentLayout = getSlideLayout(currentSlide);
    const nextBox: LayoutBox = {
      ...currentLayout[boxKey],
      [field]: parsedValue,
    } as LayoutBox;

    updateSlideLayout(index, {
      ...currentLayout,
      [boxKey]: normalizeBox(nextBox, currentLayout[boxKey]),
    });
  }

  function updateSlideStyleField(
    index: number,
    field: "textColor" | "titleFontSize" | "bodyFontSize",
    rawValue: string
  ) {
    const currentSlide = slides?.[index];
    if (!currentSlide) return;

    const currentLayout = getSlideLayout(currentSlide);
    if (field === "textColor") {
      updateSlideLayout(index, {
        ...currentLayout,
        textColor: rawValue || "#FFFFFF",
      });
      return;
    }

    const parsedValue = Number(rawValue);
    if (Number.isNaN(parsedValue)) return;

    updateSlideLayout(index, {
      ...currentLayout,
      [field]: clamp(Math.round(parsedValue), 18, 180),
    });
  }

  function applyCurrentFontSizesToAllSlides(index: number) {
    const sourceSlide = slides?.[index];
    if (!sourceSlide) return;

    const sourceLayout = getSlideLayout(sourceSlide);

    setSlides((currentSlides) => {
      if (!currentSlides) return currentSlides;

      return currentSlides.map((slide) => {
        const currentLayout = getSlideLayout(slide);
        return {
          ...slide,
          layout: buildEditableLayout({
            ...currentLayout,
            titleFontSize: sourceLayout.titleFontSize,
            bodyFontSize: sourceLayout.bodyFontSize,
          }),
        };
      });
    });

    setApprovedSlides((currentApprovals) => currentApprovals.map(() => false));
  }

  function updateSlideVisibility(index: number, field: "title" | "body", visible: boolean) {
    setSlides((currentSlides) => {
      if (!currentSlides) return currentSlides;
      return currentSlides.map((slide, slideIndex) => {
        if (slideIndex !== index) return slide;

        return field === "title"
          ? { ...slide, showTitle: visible }
          : { ...slide, showBody: visible };
      });
    });

    setApprovedSlides((currentApprovals) =>
      currentApprovals.map((approved, slideIndex) => (slideIndex === index ? false : approved))
    );
  }

  function resetSlideLayout(index: number) {
    const currentSlide = slides?.[index];
    if (!currentSlide) return;

    updateSlideLayout(index, buildEditableLayout(undefined));
  }

  function applyLayoutToMatchingSlides(index: number) {
    const currentSlide = slides?.[index];
    if (!slides || !currentSlide) return;

    const sourceLayout = buildEditableLayout(currentSlide.layout);
    const sourceType = currentSlide.slideType ?? "other";

    setSlides((currentSlides) => {
      if (!currentSlides) return currentSlides;
      return currentSlides.map((slide) =>
        (slide.slideType ?? "other") === sourceType
          ? {
              ...slide,
              layout: sourceLayout,
            }
          : slide
      );
    });

    setApprovedSlides((currentApprovals) =>
      currentApprovals.map((approved, slideIndex) => {
        const slide = slides[slideIndex];
        return (slide?.slideType ?? "other") === sourceType ? false : approved;
      })
    );
  }

  function approveSlide(index: number) {
    setApprovedSlides((currentApprovals) =>
      currentApprovals.map((approved, slideIndex) => (slideIndex === index ? true : approved))
    );
  }

  function approveAllSlides() {
    setApprovedSlides((currentApprovals) => currentApprovals.map(() => true));
  }

  const approvedCount = approvedSlides.filter(Boolean).length;
  const allSlidesApproved = slides ? slides.length > 0 && approvedCount === slides.length : false;
  const selectedSlide = slides?.[selectedSlideIndex] ?? null;

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
                disabled={downloading || !allSlidesApproved}
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-6 py-2.5 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
              >
                {downloading ? "Preparing .pro…" : allSlidesApproved ? "⬇ Download .pro" : "Approve layouts to export .pro"}
              </button>
            )}
            {slides && slides.length > 0 && (
              <button
                type="button"
                onClick={downloadPNGs}
                disabled={downloading || !allSlidesApproved}
                className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-6 py-2.5 text-sm font-semibold text-blue-300 transition hover:bg-blue-500/20 disabled:opacity-50"
              >
                {downloading ? "Generating PNGs…" : allSlidesApproved ? "⬇ Download PNGs" : "Approve layouts to export PNGs"}
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
            <div className="mb-4 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Review and approve layout
                  </h2>
                  <p className="text-sm text-cyan-100/80">
                    Adjust title and body boxes against the template, then approve each slide before exporting.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-sm text-slate-200">
                    {approvedCount} / {slides.length} approved
                  </div>
                  <button
                    type="button"
                    onClick={approveAllSlides}
                    className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                  >
                    Approve all current layouts
                  </button>
                </div>
              </div>
            </div>

            {selectedSlide && (
              <div className="mb-8 grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_360px]">
                <LayoutEditorPreview
                  slide={selectedSlide}
                  index={selectedSlideIndex}
                  templateImageDataUrl={resolveTemplateForSlide(selectedSlide, templateSlideImageDataUrls)}
                  approved={approvedSlides[selectedSlideIndex] ?? false}
                  onBoxChange={(boxKey, nextBox) => {
                    const currentLayout = getSlideLayout(selectedSlide);
                    updateSlideLayout(selectedSlideIndex, {
                      ...currentLayout,
                      [boxKey]: nextBox,
                    });
                  }}
                />
                <aside className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                        Slide {selectedSlideIndex + 1}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold text-white">
                        {selectedSlide.title || "Untitled slide"}
                      </h3>
                      <p className="mt-1 text-xs text-slate-400">
                        {(selectedSlide.slideType ?? "other").toUpperCase()} template mapping
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        approvedSlides[selectedSlideIndex]
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      {approvedSlides[selectedSlideIndex] ? "Approved" : "Pending"}
                    </span>
                  </div>

                  <div className="mt-4 space-y-4">
                    <LayoutBoxEditor
                      title="Title box"
                      enabled={isSlideTextVisible(selectedSlide, "title")}
                      hasContent={hasSlideText(selectedSlide, "title")}
                      box={getSlideLayout(selectedSlide).titleBox}
                      toggleLabel={isSlideTextVisible(selectedSlide, "title") ? "Hide title" : "Use title"}
                      onToggle={() =>
                        updateSlideVisibility(
                          selectedSlideIndex,
                          "title",
                          !isSlideTextVisible(selectedSlide, "title")
                        )
                      }
                      onFieldChange={(field, value) =>
                        updateSlideBox(selectedSlideIndex, "titleBox", field, value)
                      }
                    />
                    <LayoutBoxEditor
                      title="Body box"
                      enabled={isSlideTextVisible(selectedSlide, "body")}
                      hasContent={hasSlideText(selectedSlide, "body")}
                      box={getSlideLayout(selectedSlide).bodyBox}
                      toggleLabel={isSlideTextVisible(selectedSlide, "body") ? "Hide body" : "Use body"}
                      onToggle={() =>
                        updateSlideVisibility(
                          selectedSlideIndex,
                          "body",
                          !isSlideTextVisible(selectedSlide, "body")
                        )
                      }
                      onFieldChange={(field, value) =>
                        updateSlideBox(selectedSlideIndex, "bodyBox", field, value)
                      }
                    />

                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-white">Text styling</p>
                        <button
                          type="button"
                          onClick={() => applyCurrentFontSizesToAllSlides(selectedSlideIndex)}
                          className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
                        >
                          Apply font sizes to all slides
                        </button>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                        <label className="text-xs text-slate-400">
                          Text color
                          <input
                            type="color"
                            value={getSlideLayout(selectedSlide).textColor}
                            onChange={(e) => updateSlideStyleField(selectedSlideIndex, "textColor", e.target.value)}
                            className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent"
                          />
                        </label>
                        <label className="text-xs text-slate-400">
                          Title font size
                          <div className="mt-1 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                updateSlideStyleField(
                                  selectedSlideIndex,
                                  "titleFontSize",
                                  String(getSlideLayout(selectedSlide).titleFontSize - 2)
                                )
                              }
                              className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white transition hover:bg-white/10"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min={18}
                              max={180}
                              value={getSlideLayout(selectedSlide).titleFontSize}
                              onChange={(e) => updateSlideStyleField(selectedSlideIndex, "titleFontSize", e.target.value)}
                              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateSlideStyleField(
                                  selectedSlideIndex,
                                  "titleFontSize",
                                  String(getSlideLayout(selectedSlide).titleFontSize + 2)
                                )
                              }
                              className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white transition hover:bg-white/10"
                            >
                              +
                            </button>
                          </div>
                        </label>
                        <label className="text-xs text-slate-400">
                          Body font size
                          <div className="mt-1 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                updateSlideStyleField(
                                  selectedSlideIndex,
                                  "bodyFontSize",
                                  String(getSlideLayout(selectedSlide).bodyFontSize - 2)
                                )
                              }
                              className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white transition hover:bg-white/10"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min={18}
                              max={180}
                              value={getSlideLayout(selectedSlide).bodyFontSize}
                              onChange={(e) => updateSlideStyleField(selectedSlideIndex, "bodyFontSize", e.target.value)}
                              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateSlideStyleField(
                                  selectedSlideIndex,
                                  "bodyFontSize",
                                  String(getSlideLayout(selectedSlide).bodyFontSize + 2)
                                )
                              }
                              className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white transition hover:bg-white/10"
                            >
                              +
                            </button>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    <button
                      type="button"
                      onClick={() => approveSlide(selectedSlideIndex)}
                      className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
                    >
                      Approve this slide
                    </button>
                    <button
                      type="button"
                      onClick={() => applyLayoutToMatchingSlides(selectedSlideIndex)}
                      className="rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
                    >
                      Apply to all {(selectedSlide.slideType ?? "other")} slides
                    </button>
                    <button
                      type="button"
                      onClick={() => resetSlideLayout(selectedSlideIndex)}
                      className="rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
                    >
                      Reset to default layout
                    </button>
                  </div>
                </aside>
              </div>
            )}

            <h2 className="mb-4 text-lg font-semibold text-white">
              Preview — {slides.length} slide{slides.length !== 1 ? "s" : ""} generated
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {slides.map((slide, i) => (
                <SlideCard
                  key={i}
                  slide={slide}
                  index={i}
                  approved={approvedSlides[i] ?? false}
                  selected={selectedSlideIndex === i}
                  onSelect={() => setSelectedSlideIndex(i)}
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
  approved,
  selected,
  onSelect,
  templateImageDataUrl,
}: {
  slide: Slide;
  index: number;
  approved: boolean;
  selected: boolean;
  onSelect: () => void;
  templateImageDataUrl: string | null;
}) {
  const [showNotes, setShowNotes] = useState(false);
  const layout = getSlideLayout(slide);
  const showTitle = isSlideTextVisible(slide, "title");
  const showBody = isSlideTextVisible(slide, "body");
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`flex flex-col overflow-hidden rounded-xl border bg-black text-left shadow-lg transition ${
        selected
          ? "border-cyan-400/70 ring-2 ring-cyan-400/30"
          : "border-white/10 hover:border-white/25"
      }`}
    >
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
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-medium text-slate-600">
            {index + 1}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              approved ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"
            }`}
          >
            {approved ? "Approved" : "Pending"}
          </span>
        </div>
        {showTitle && (
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
        {showBody && (
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
            type="button"
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

function LayoutEditorPreview({
  slide,
  index,
  approved,
  onBoxChange,
  templateImageDataUrl,
}: {
  slide: Slide;
  index: number;
  approved: boolean;
  onBoxChange: (boxKey: SlideBoxKey, nextBox: LayoutBox & { align: BoxAlign }) => void;
  templateImageDataUrl: string | null;
}) {
  const layout = getSlideLayout(slide);
  const showTitle = isSlideTextVisible(slide, "title");
  const showBody = isSlideTextVisible(slide, "body");
  const previewRef = useRef<HTMLDivElement>(null);
  const [activeInteraction, setActiveInteraction] = useState<{
    boxKey: SlideBoxKey;
    mode: BoxInteractionMode;
    startClientX: number;
    startClientY: number;
    startBox: LayoutBox & { align: BoxAlign };
  } | null>(null);

  useEffect(() => {
    const interaction = activeInteraction;
    if (!interaction) return undefined;

    function handlePointerMove(event: PointerEvent) {
      if (!interaction) return;

      const previewElement = previewRef.current;
      if (!previewElement) return;

      const bounds = previewElement.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;

      const deltaXPercent = ((event.clientX - interaction.startClientX) / bounds.width) * 100;
      const deltaYPercent = ((event.clientY - interaction.startClientY) / bounds.height) * 100;
      const nextBox = adjustBoxFromInteraction(
        interaction.startBox,
        interaction.mode,
        deltaXPercent,
        deltaYPercent
      );

      onBoxChange(interaction.boxKey, nextBox);
    }

    function handlePointerUp() {
      setActiveInteraction(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [activeInteraction, onBoxChange]);

  function startInteraction(
    event: React.PointerEvent<HTMLDivElement>,
    boxKey: SlideBoxKey,
    mode: BoxInteractionMode
  ) {
    event.preventDefault();
    event.stopPropagation();

    setActiveInteraction({
      boxKey,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startBox: layout[boxKey],
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 bg-slate-950/80 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Live editor preview</p>
          <p className="text-sm text-slate-300">Slide {index + 1} export canvas</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            approved ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
          }`}
        >
          {approved ? "Approved" : "Needs review"}
        </span>
      </div>
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
          <span>Drag a box to move it. Use the corner handles to resize it.</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-300">
            16:9 canvas
          </span>
        </div>
        <div
          ref={previewRef}
          className="relative overflow-hidden rounded-xl bg-black touch-none"
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
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:10%_10%]" />
          {showTitle && (
            <PreviewTextBox
              box={layout.titleBox}
              label="Title"
              color={layout.textColor}
              emphasis
              active={activeInteraction?.boxKey === "titleBox"}
              onInteractStart={(event, mode) => startInteraction(event, "titleBox", mode)}
            >
              <span
                className="whitespace-pre-line font-bold leading-snug"
                style={{ fontSize: `${Math.max(18, Math.round(layout.titleFontSize / 2.5))}px` }}
              >
                {slide.title || "Title preview"}
              </span>
            </PreviewTextBox>
          )}
          {showBody && (
            <PreviewTextBox
              box={layout.bodyBox}
              label="Body"
              color={layout.textColor}
              active={activeInteraction?.boxKey === "bodyBox"}
              onInteractStart={(event, mode) => startInteraction(event, "bodyBox", mode)}
            >
              <span
                className="whitespace-pre-line leading-relaxed"
                style={{ fontSize: `${Math.max(16, Math.round(layout.bodyFontSize / 2.7))}px` }}
              >
                {slide.body || "Body preview"}
              </span>
            </PreviewTextBox>
          )}
          {!showTitle && !showBody && (
            <div className="absolute inset-x-6 top-6 rounded-xl border border-dashed border-white/20 bg-black/35 px-4 py-3 text-sm text-slate-300">
              This slide has no active text boxes. Re-enable title or body from the editor to place text.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewTextBox({
  box,
  label,
  color,
  active,
  emphasis = false,
  onInteractStart,
  children,
}: {
  box: { x: number; y: number; width: number; height: number; align: BoxAlign };
  label: string;
  color: string;
  active: boolean;
  emphasis?: boolean;
  onInteractStart: (
    event: React.PointerEvent<HTMLDivElement>,
    mode: BoxInteractionMode
  ) => void;
  children: React.ReactNode;
}) {
  const handleClassName =
    "absolute h-3.5 w-3.5 rounded-full border border-white/80 bg-slate-950 shadow-[0_0_0_2px_rgba(15,23,42,0.65)]";

  return (
    <div
      className={`absolute overflow-hidden rounded-lg border-2 px-3 py-2 transition ${
        emphasis ? "border-cyan-300/90 bg-cyan-300/10" : "border-amber-300/80 bg-amber-300/10"
      } ${active ? "ring-4 ring-white/15" : ""}`}
      onPointerDown={(event) => onInteractStart(event, "move")}
      role="presentation"
      style={{
        left: `${box.x}%`,
        top: `${box.y}%`,
        width: `${box.width}%`,
        height: `${box.height}%`,
        color,
        textAlign: box.align,
        cursor: active ? "grabbing" : "grab",
        userSelect: "none",
      }}
    >
      <div
        className={`${handleClassName} left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize`}
        onPointerDown={(event) => onInteractStart(event, "resize-nw")}
      />
      <div
        className={`${handleClassName} right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize`}
        onPointerDown={(event) => onInteractStart(event, "resize-ne")}
      />
      <div
        className={`${handleClassName} bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize`}
        onPointerDown={(event) => onInteractStart(event, "resize-sw")}
      />
      <div
        className={`${handleClassName} bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize`}
        onPointerDown={(event) => onInteractStart(event, "resize-se")}
      />
      <span className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
        {label}
      </span>
      <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-200">
        Drag
      </span>
      <div className="h-full overflow-hidden pt-8">{children}</div>
    </div>
  );
}

function LayoutBoxEditor({
  title,
  enabled,
  hasContent,
  box,
  toggleLabel,
  onToggle,
  onFieldChange,
}: {
  title: string;
  enabled: boolean;
  hasContent: boolean;
  box: { x: number; y: number; width: number; height: number; align: BoxAlign };
  toggleLabel: string;
  onToggle: () => void;
  onFieldChange: (field: keyof LayoutBox, value: string) => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-white">{title}</p>
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Percent</span>
          <button
            type="button"
            disabled={!hasContent}
            onClick={onToggle}
            className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {toggleLabel}
          </button>
        </div>
      </div>
      {!hasContent && (
        <p className="mt-3 text-xs text-slate-500">No text was generated for this section on this slide.</p>
      )}
      {hasContent && !enabled && (
        <p className="mt-3 text-xs text-slate-400">This text box is currently removed from preview and export. Use the button above to restore it.</p>
      )}
      {hasContent && enabled && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumericLayoutField label="X" value={box.x} min={0} max={100} onChange={(value) => onFieldChange("x", value)} />
          <NumericLayoutField label="Y" value={box.y} min={0} max={100} onChange={(value) => onFieldChange("y", value)} />
          <NumericLayoutField label="Width" value={box.width} min={5} max={100} onChange={(value) => onFieldChange("width", value)} />
          <NumericLayoutField label="Height" value={box.height} min={5} max={100} onChange={(value) => onFieldChange("height", value)} />
          <label className="col-span-2 text-xs text-slate-400">
            Alignment
            <select
              value={box.align}
              onChange={(e) => onFieldChange("align", e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
        </div>
      )}
    </div>
  );
}

function NumericLayoutField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs text-slate-400">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step="0.1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
      />
    </label>
  );
}

