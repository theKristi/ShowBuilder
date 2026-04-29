/**
 * ProPresenter 6 (.pro6) XML file generator.
 * Produces a valid .pro6 file that can be imported into ProPresenter 6 or 7.
 */

export interface Slide {
  title: string;
  body: string;
  notes?: string;
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

export interface PresentationOptions {
  title: string;
  author?: string;
  category?: string;
  backgroundColor?: string; // "R G B A" e.g. "0 0 0 1"
  textColor?: string; // "R G B A" e.g. "1 1 1 1"
  fontName?: string;
  titleFontSize?: number;
  bodyFontSize?: number;
  width?: number;
  height?: number;
}

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16).toUpperCase();
  });
}

/**
 * Builds a minimal RTF string for ProPresenter text.
 * ProPresenter expects RTF with specific attributes for color and font.
 */
function buildRTF(
  text: string,
  options: {
    fontName: string;
    fontSize: number;
    colorR: number;
    colorG: number;
    colorB: number;
    align?: "left" | "center" | "right";
  }
): string {
  const halfPtSize = options.fontSize * 2;
  const alignmentControlWord =
    options.align === "center" ? "\\qc" : options.align === "right" ? "\\qr" : "\\ql";
  // Escape special RTF characters
  const escaped = text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, "\\line ");

  return (
    `{\\rtf1\\ansi\\deff0` +
    `{\\fonttbl{\\f0 ${options.fontName};}}` +
    `{\\colortbl;\\red${options.colorR}\\green${options.colorG}\\blue${options.colorB};}` +
    `${alignmentControlWord}\\f0\\cf1\\fs${halfPtSize} ${escaped}}`
  );
}

function toBase64(str: string): string {
  return Buffer.from(str, "utf-8").toString("base64");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function parseHexColor(value: string | undefined, fallback: string): { r: number; g: number; b: number } {
  const resolved = (value ?? fallback).trim();
  const hexMatch = resolved.match(/^#?([0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }

  const rgbaParts = fallback.split(" ").map((part) => Math.round(parseFloat(part) * 255));
  return {
    r: rgbaParts[0] ?? 255,
    g: rgbaParts[1] ?? 255,
    b: rgbaParts[2] ?? 255,
  };
}

function toPixels(percent: number, total: number): number {
  return Math.round((percent / 100) * total);
}

/**
 * Builds a single RVDisplaySlide XML element.
 */
function buildSlideXML(
  slide: Slide,
  index: number,
  opts: Required<PresentationOptions>
): string {
  const slideUUID = generateUUID();
  const titleElementUUID = generateUUID();
  const bodyElementUUID = generateUUID();

  const width = opts.width;
  const height = opts.height;

  const { r, g, b } = parseHexColor(slide.layout?.textColor, opts.textColor);

  const hasTitle = slide.title && slide.title.trim().length > 0;
  const hasBody = slide.body && slide.body.trim().length > 0;

  const defaultTitleBox = { x: 10, y: 10, width: 80, height: 14, align: "left" as const };
  const defaultBodyBox = { x: 10, y: 28, width: 80, height: 54, align: "left" as const };
  const titleBox = slide.layout?.titleBox ?? defaultTitleBox;
  const bodyBox = slide.layout?.bodyBox ?? defaultBodyBox;
  const titleFontSize = slide.layout?.titleFontSize ?? opts.titleFontSize;
  const bodyFontSize = slide.layout?.bodyFontSize ?? opts.bodyFontSize;

  let elements = "";

  if (hasTitle) {
    const titleRTF = buildRTF(slide.title, {
      fontName: opts.fontName,
      fontSize: titleFontSize,
      colorR: r,
      colorG: g,
      colorB: b,
      align: titleBox.align,
    });
    const titlePlainText = toBase64(slide.title);
    elements += `
      <RVTextElement
        displayDelay="0"
        displayName="Title"
        locked="false"
        persistent="0"
        typeID="0"
        fromTemplate="false"
        opacity="1"
        bezelRadius="0"
        drawingFill="false"
        drawingShadow="false"
        drawingStroke="false"
        fillColor="0 0 0 0"
        rotation="0"
        source=""
        adjustsHeightToFit="false"
        verticalAlignment="0"
        revealType="0"
        UUID="${titleElementUUID}"
      >
        <RVRect3D rvXMLIvarName="position">{${toPixels(titleBox.x, width)} ${toPixels(titleBox.y, height)} 0 ${toPixels(titleBox.width, width)} ${toPixels(titleBox.height, height)}}</RVRect3D>
        <shadow rvXMLIvarName="shadow">0|0 0 0 0|{0, 0}</shadow>
        <dictionary rvXMLIvarName="stroke" containerClass="NSMutableDictionary">
          <NSColor rvXMLDictionaryKey="RVShapeElementStrokeColorKey">0 0 0 0</NSColor>
          <NSNumber rvXMLDictionaryKey="RVShapeElementStrokeWidthKey">0</NSNumber>
        </dictionary>
        <NSString rvXMLIvarName="PlainText">${titlePlainText}</NSString>
        <NSString rvXMLIvarName="RTFData">${toBase64(titleRTF)}</NSString>
      </RVTextElement>`;
  }

  if (hasBody) {
    const bodyRTF = buildRTF(slide.body, {
      fontName: opts.fontName,
      fontSize: bodyFontSize,
      colorR: r,
      colorG: g,
      colorB: b,
      align: bodyBox.align,
    });
    const bodyPlainText = toBase64(slide.body);
    elements += `
      <RVTextElement
        displayDelay="0"
        displayName="Body"
        locked="false"
        persistent="0"
        typeID="0"
        fromTemplate="false"
        opacity="1"
        bezelRadius="0"
        drawingFill="false"
        drawingShadow="false"
        drawingStroke="false"
        fillColor="0 0 0 0"
        rotation="0"
        source=""
        adjustsHeightToFit="false"
        verticalAlignment="0"
        revealType="0"
        UUID="${bodyElementUUID}"
      >
        <RVRect3D rvXMLIvarName="position">{${toPixels(bodyBox.x, width)} ${toPixels(bodyBox.y, height)} 0 ${toPixels(bodyBox.width, width)} ${toPixels(bodyBox.height, height)}}</RVRect3D>
        <shadow rvXMLIvarName="shadow">0|0 0 0 0|{0, 0}</shadow>
        <dictionary rvXMLIvarName="stroke" containerClass="NSMutableDictionary">
          <NSColor rvXMLDictionaryKey="RVShapeElementStrokeColorKey">0 0 0 0</NSColor>
          <NSNumber rvXMLDictionaryKey="RVShapeElementStrokeWidthKey">0</NSNumber>
        </dictionary>
        <NSString rvXMLIvarName="PlainText">${bodyPlainText}</NSString>
        <NSString rvXMLIvarName="RTFData">${toBase64(bodyRTF)}</NSString>
      </RVTextElement>`;
  }

  const notes = slide.notes ? escapeXml(slide.notes) : "";

  return `
    <RVDisplaySlide
      backgroundColor="${opts.backgroundColor}"
      enabled="true"
      highlightColor=""
      hotKey=""
      label=""
      notes="${notes}"
      UUID="${slideUUID}"
      drawingBackgroundColor="false"
      chordChartPath=""
    >
      <cues containerClass="NSMutableArray"/>
      <displayElements containerClass="NSMutableArray">
        ${elements}
      </displayElements>
      <_-RVProTransitionObject-_transitionObject transitionType="-1" transitionDuration="1" motionEnabled="0" motionDuration="20" motionSpeed="100"/>
    </RVDisplaySlide>`;
}

/**
 * Generates a ProPresenter 6 (.pro6) XML string from an array of slides.
 */
export function generateProPresenterXML(
  slides: Slide[],
  options: PresentationOptions
): string {
  const opts: Required<PresentationOptions> = {
    title: options.title,
    author: options.author ?? "",
    category: options.category ?? "Presentation",
    backgroundColor: options.backgroundColor ?? "0 0 0 1",
    textColor: options.textColor ?? "1 1 1 1",
    fontName: options.fontName ?? "Arial",
    titleFontSize: options.titleFontSize ?? 60,
    bodyFontSize: options.bodyFontSize ?? 40,
    width: options.width ?? 1920,
    height: options.height ?? 1080,
  };

  const presentationUUID = generateUUID();
  const groupUUID = generateUUID();
  const now = new Date().toISOString().replace(/\.\d{3}/, "");

  const safeTitle = escapeXml(opts.title);
  const safeAuthor = escapeXml(opts.author);
  const safeCategory = escapeXml(opts.category);

  const slidesXML = slides.map((slide, i) => buildSlideXML(slide, i, opts)).join("");

  return `<?xml version="1.0" encoding="utf-8"?>
<RVPresentationDocument
  height="${opts.height}"
  width="${opts.width}"
  versionNumber="600"
  docType="0"
  lastDateUsed="${now}"
  usedCount="0"
  category="${safeCategory}"
  resourcesDirectory=""
  backgroundColor="${opts.backgroundColor}"
  drawingBackgroundColor="false"
  notes=""
  artist=""
  author="${safeAuthor}"
  album=""
  CCLIDisplay="false"
  CCLIArtistCredits=""
  CCLISongTitle="${safeTitle}"
  CCLIPublisher=""
  CCLICopyrightInfo=""
  CCLILicenseNumber=""
  selectedArrangementID=""
  chordChartPath=""
  os="1"
  buildNumber="6016"
  UUID="${presentationUUID}"
>
  <RVTimeline rvXMLIvarName="timeline" timeOffset="0" selectedMediaTrackIndex="-1" duration="0" loop="false">
    <timeCues containerClass="NSMutableArray"/>
    <mediaTracks containerClass="NSMutableArray"/>
  </RVTimeline>
  <bibleReference containerClass="NSMutableArray"/>
  <_-RVProTransitionObject-_transitionObject transitionType="-1" transitionDuration="1" motionEnabled="0" motionDuration="20" motionSpeed="100"/>
  <groups containerClass="NSMutableArray">
    <RVSlideGrouping
      name="${safeTitle}"
      uuid="${groupUUID}"
      color="1 1 1 0"
    >
      <slides containerClass="NSMutableArray">
        ${slidesXML}
      </slides>
    </RVSlideGrouping>
  </groups>
  <arrangements containerClass="NSMutableArray"/>
</RVPresentationDocument>`;
}
