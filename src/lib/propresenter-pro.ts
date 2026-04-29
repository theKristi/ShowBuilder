import protobuf from "protobufjs";

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
  backgroundColor?: string;
  textColor?: string;
  fontName?: string;
  titleFontSize?: number;
  bodyFontSize?: number;
  width?: number;
  height?: number;
}

const PRO_SCHEMA = String.raw`syntax = "proto3";

package rv.data;

message UUID {
  string string = 1;
}

message Timestamp {
  int64 seconds = 1;
  int32 nanos = 2;
}

message Color {
  float red = 1;
  float green = 2;
  float blue = 3;
  float alpha = 4;
}

message Version {
  uint32 major_version = 1;
  uint32 minor_version = 2;
  uint32 patch_version = 3;
  string build = 4;
}

message ApplicationInfo {
  enum Platform {
    PLATFORM_UNDEFINED = 0;
    PLATFORM_MACOS = 1;
    PLATFORM_WINDOWS = 2;
  }
  Platform platform = 1;
  rv.data.Version platform_version = 2;

  enum Application {
    APPLICATION_UNDEFINED = 0;
    APPLICATION_PROPRESENTER = 1;
    APPLICATION_PVP = 2;
    APPLICATION_PROVIDEOSERVER = 3;
    APPLICATION_SCOREBOARD = 4;
  }
  Application application = 3;
  rv.data.Version application_version = 4;
}

message Group {
  rv.data.UUID uuid = 1;
  string name = 2;
  rv.data.Color color = 3;
}

message Cue {
  rv.data.UUID uuid = 1;
  string name = 2;
  repeated rv.data.Action actions = 10;
  bool isEnabled = 12;
}

message Action {
  rv.data.UUID uuid = 1;
  string name = 2;
  bool isEnabled = 6;
  enum ActionType {
    ACTION_TYPE_UNKNOWN = 0;
    ACTION_TYPE_STAGE_LAYOUT = 1;
    ACTION_TYPE_MEDIA = 2;
    ACTION_TYPE_TIMER = 3;
    ACTION_TYPE_COMMUNICATION = 4;
    ACTION_TYPE_CLEAR = 5;
    ACTION_TYPE_PROP = 6;
    ACTION_TYPE_MASK = 7;
    ACTION_TYPE_MESSAGE = 8;
    ACTION_TYPE_SOCIAL_MEDIA = 9;
    ACTION_TYPE_MULTISCREEN = 10;
    ACTION_TYPE_PRESENTATION_SLIDE = 11;
  }
  ActionType type = 9;
  rv.data.Action.SlideType slide = 23;

  message SlideType {
    rv.data.PresentationSlide presentation = 2;
  }
}

message Graphics {
  message Point {
    double x = 1;
    double y = 2;
  }

  message Size {
    double width = 1;
    double height = 2;
  }

  message Rect {
    rv.data.Graphics.Point origin = 1;
    rv.data.Graphics.Size size = 2;
  }

  message EdgeInsets {
    double left = 1;
    double right = 2;
    double top = 3;
    double bottom = 4;
  }

  message Path {
    bool closed = 1;
    rv.data.Graphics.Path.Shape shape = 3;

    message Shape {
      enum Type {
        TYPE_UNKNOWN = 0;
        TYPE_RECTANGLE = 1;
      }
      Type type = 1;
    }
  }

  message Fill {
    rv.data.Color color = 1;
    bool enable = 4;
  }

  message Stroke {
    enum Style {
      STYLE_SOLID_LINE = 0;
    }
    Style style = 1;
    double width = 2;
    rv.data.Color color = 3;
    bool enable = 5;
  }

  message Shadow {
    enum Style {
      STYLE_DROP = 0;
    }
    Style style = 1;
    double angle = 2;
    double offset = 3;
    double radius = 4;
    rv.data.Color color = 5;
    double opacity = 6;
    bool enable = 7;
  }

  message Text {
    rv.data.Graphics.Text.Attributes attributes = 3;
    bytes rtf_data = 5;
    enum VerticalAlignment {
      VERTICAL_ALIGNMENT_TOP = 0;
      VERTICAL_ALIGNMENT_MIDDLE = 1;
      VERTICAL_ALIGNMENT_BOTTOM = 2;
    }
    VerticalAlignment vertical_alignment = 6;
    enum ScaleBehavior {
      SCALE_BEHAVIOR_NONE = 0;
      SCALE_BEHAVIOR_ADJUST_CONTAINER_HEIGHT = 1;
      SCALE_BEHAVIOR_SCALE_FONT_DOWN = 2;
      SCALE_BEHAVIOR_SCALE_FONT_UP = 3;
      SCALE_BEHAVIOR_SCALE_FONT_UP_DOWN = 4;
    }
    ScaleBehavior scale_behavior = 7;
    rv.data.Graphics.EdgeInsets margins = 8;

    message Attributes {
      rv.data.Graphics.Text.Attributes.Font font = 1;
      rv.data.Color text_solid_fill = 3;
      rv.data.Graphics.Text.Attributes.Paragraph paragraph_style = 6;
      double stroke_width = 11;
      rv.data.Color stroke_color = 12;
      rv.data.Color background_color = 15;

      message Font {
        string name = 1;
        double size = 2;
        bool italic = 4;
        bool bold = 8;
        string family = 9;
        string face = 10;
      }

      message Paragraph {
        enum Alignment {
          ALIGNMENT_LEFT = 0;
          ALIGNMENT_RIGHT = 1;
          ALIGNMENT_CENTER = 2;
          ALIGNMENT_JUSTIFIED = 3;
          ALIGNMENT_NATURAL = 4;
        }
        Alignment alignment = 1;
        double first_line_head_indent = 2;
        double head_indent = 3;
        double tail_indent = 4;
        double line_height_multiple = 5;
        double maximum_line_height = 6;
        double minimum_line_height = 7;
        double line_spacing = 8;
        double paragraph_spacing = 9;
        double paragraph_spacing_before = 10;
        double default_tab_interval = 12;
      }
    }
  }

  message Element {
    rv.data.UUID uuid = 1;
    string name = 2;
    rv.data.Graphics.Rect bounds = 3;
    double rotation = 4;
    double opacity = 5;
    bool locked = 6;
    bool aspect_ratio_locked = 7;
    rv.data.Graphics.Path path = 8;
    rv.data.Graphics.Fill fill = 9;
    rv.data.Graphics.Stroke stroke = 10;
    rv.data.Graphics.Shadow shadow = 11;
    rv.data.Graphics.Text text = 13;
    bool hidden = 16;
  }
}

message Slide {
  message Element {
    rv.data.Graphics.Element element = 1;
    uint32 info = 4;
    enum TextRevealType {
      TEXT_REVEAL_TYPE_NONE = 0;
    }
    TextRevealType reveal_type = 5;
  }

  repeated rv.data.Slide.Element elements = 1;
  repeated rv.data.UUID element_build_order = 2;
  bool draws_background_color = 4;
  rv.data.Color background_color = 5;
  rv.data.Graphics.Size size = 6;
  rv.data.UUID uuid = 7;
}

message PresentationSlide {
  message Notes {
    bytes rtf_data = 1;
    rv.data.Graphics.Text.Attributes attributes = 2;
  }

  rv.data.Slide base_slide = 1;
  rv.data.PresentationSlide.Notes notes = 2;
}

message Presentation {
  message Arrangement {
    rv.data.UUID uuid = 1;
    string name = 2;
    repeated rv.data.UUID group_identifiers = 3;
  }

  message CueGroup {
    rv.data.Group group = 1;
    repeated rv.data.UUID cue_identifiers = 2;
  }

  rv.data.ApplicationInfo application_info = 1;
  rv.data.UUID uuid = 2;
  string name = 3;
  rv.data.Timestamp last_modified_date = 5;
  string category = 6;
  string notes = 7;
  rv.data.UUID selected_arrangement = 10;
  repeated rv.data.Presentation.Arrangement arrangements = 11;
  repeated rv.data.Presentation.CueGroup cue_groups = 12;
  repeated rv.data.Cue cues = 13;
}`;

const root = protobuf.parse(PRO_SCHEMA).root;
const PresentationType = root.lookupType("rv.data.Presentation");

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16).toUpperCase();
  });
}

function toPixels(percent: number, total: number): number {
  return Math.round((percent / 100) * total);
}

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

function parseHexColor(value: string | undefined, fallback: string): { r: number; g: number; b: number; a: number } {
  const resolved = (value ?? fallback).trim();
  const hexMatch = resolved.match(/^#?([0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: 1,
    };
  }

  const rgbaParts = fallback.split(" ").map((part) => parseFloat(part));
  return {
    r: Math.round((rgbaParts[0] ?? 1) * 255),
    g: Math.round((rgbaParts[1] ?? 1) * 255),
    b: Math.round((rgbaParts[2] ?? 1) * 255),
    a: rgbaParts[3] ?? 1,
  };
}

function toProtoColor(color: { r: number; g: number; b: number; a?: number }) {
  return {
    red: color.r / 255,
    green: color.g / 255,
    blue: color.b / 255,
    alpha: color.a ?? 1,
  };
}

function transparentColor() {
  return { red: 0, green: 0, blue: 0, alpha: 0 };
}

function buildTimestamp(date: Date) {
  const ms = date.getTime();
  return {
    seconds: Math.floor(ms / 1000),
    nanos: (ms % 1000) * 1_000_000,
  };
}

function buildTextAttributes(
  fontName: string,
  fontSize: number,
  textColor: { r: number; g: number; b: number; a: number },
  align: "left" | "center" | "right"
) {
  return {
    font: {
      name: fontName,
      size: fontSize,
      italic: false,
      bold: false,
      family: fontName,
      face: fontName,
    },
    text_solid_fill: toProtoColor(textColor),
    paragraph_style: {
      alignment: align === "center" ? 2 : align === "right" ? 1 : 0,
      first_line_head_indent: 0,
      head_indent: 0,
      tail_indent: 0,
      line_height_multiple: 1,
      maximum_line_height: 0,
      minimum_line_height: 0,
      line_spacing: 0,
      paragraph_spacing: 0,
      paragraph_spacing_before: 0,
      default_tab_interval: 36,
    },
    stroke_width: 0,
    stroke_color: transparentColor(),
    background_color: transparentColor(),
  };
}

function buildTextElement(
  id: string,
  name: string,
  text: string,
  box: { x: number; y: number; width: number; height: number; align?: "left" | "center" | "right" },
  slideWidth: number,
  slideHeight: number,
  fontName: string,
  fontSize: number,
  textColor: { r: number; g: number; b: number; a: number },
  bold: boolean
) {
  const rtf = buildRTF(text, {
    fontName,
    fontSize,
    colorR: textColor.r,
    colorG: textColor.g,
    colorB: textColor.b,
    align: box.align ?? "left",
  });

  return {
    element: {
      uuid: { string: id },
      name,
      bounds: {
        origin: {
          x: toPixels(box.x, slideWidth),
          y: toPixels(box.y, slideHeight),
        },
        size: {
          width: toPixels(box.width, slideWidth),
          height: toPixels(box.height, slideHeight),
        },
      },
      rotation: 0,
      opacity: 1,
      locked: false,
      aspect_ratio_locked: false,
      path: {
        closed: true,
        shape: {
          type: 1,
        },
      },
      fill: {
        color: transparentColor(),
        enable: false,
      },
      stroke: {
        style: 0,
        width: 0,
        color: transparentColor(),
        enable: false,
      },
      shadow: {
        style: 0,
        angle: 0,
        offset: 0,
        radius: 0,
        color: { red: 0, green: 0, blue: 0, alpha: 1 },
        opacity: 0,
        enable: false,
      },
      text: {
        attributes: {
          ...buildTextAttributes(fontName, fontSize, textColor, box.align ?? "left"),
          font: {
            name: fontName,
            size: fontSize,
            italic: false,
            bold,
            family: fontName,
            face: fontName,
          },
        },
        rtf_data: Buffer.from(rtf, "utf8"),
        vertical_alignment: 0,
        scale_behavior: 1,
        margins: {
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
        },
      },
      hidden: false,
    },
    info: 0,
    reveal_type: 0,
  };
}

export function generateProPresenterBuffer(slides: Slide[], options: PresentationOptions): Buffer {
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

  const presentationUuid = generateUUID();
  const arrangementUuid = generateUUID();
  const now = new Date();
  const cueGroups: unknown[] = [];
  const cues: unknown[] = [];
  const groupIds: Array<{ string: string }> = [];

  slides.forEach((slide, index) => {
    const cueUuid = generateUUID();
    const groupUuid = generateUUID();
    const slideUuid = generateUUID();
    const textColor = parseHexColor(slide.layout?.textColor, opts.textColor);

    const titleBox = slide.layout?.titleBox ?? { x: 10, y: 10, width: 80, height: 14, align: "left" as const };
    const bodyBox = slide.layout?.bodyBox ?? { x: 10, y: 28, width: 80, height: 54, align: "left" as const };

    const elements: unknown[] = [];
    const buildOrder: Array<{ string: string }> = [];

    if (slide.title.trim()) {
      const elementId = generateUUID();
      elements.push(
        buildTextElement(
          elementId,
          "Title",
          slide.title,
          titleBox,
          opts.width,
          opts.height,
          opts.fontName,
          slide.layout?.titleFontSize ?? opts.titleFontSize,
          textColor,
          true
        )
      );
      buildOrder.push({ string: elementId });
    }

    if (slide.body.trim()) {
      const elementId = generateUUID();
      elements.push(
        buildTextElement(
          elementId,
          "Body",
          slide.body,
          bodyBox,
          opts.width,
          opts.height,
          opts.fontName,
          slide.layout?.bodyFontSize ?? opts.bodyFontSize,
          textColor,
          false
        )
      );
      buildOrder.push({ string: elementId });
    }

    const notes = slide.notes?.trim()
      ? {
          rtf_data: Buffer.from(buildRTF(slide.notes, {
            fontName: opts.fontName,
            fontSize: 24,
            colorR: 255,
            colorG: 255,
            colorB: 255,
            align: "left",
          }), "utf8"),
          attributes: buildTextAttributes(opts.fontName, 24, { r: 255, g: 255, b: 255, a: 1 }, "left"),
        }
      : undefined;

    const actionUuid = generateUUID();
    const cueName = slide.title.trim() || `Slide ${index + 1}`;

    cueGroups.push({
      group: {
        uuid: { string: groupUuid },
        name: cueName,
        color: transparentColor(),
      },
      cue_identifiers: [{ string: cueUuid }],
    });

    groupIds.push({ string: groupUuid });

    cues.push({
      uuid: { string: cueUuid },
      name: cueName,
      actions: [
        {
          uuid: { string: actionUuid },
          name: cueName,
          isEnabled: true,
          type: 11,
          slide: {
            presentation: {
              base_slide: {
                elements,
                element_build_order: buildOrder,
                draws_background_color: false,
                background_color: transparentColor(),
                size: {
                  width: opts.width,
                  height: opts.height,
                },
                uuid: { string: slideUuid },
              },
              ...(notes ? { notes } : {}),
            },
          },
        },
      ],
      isEnabled: true,
    });
  });

  const payload = {
    application_info: {
      platform: 2,
      platform_version: {
        major_version: 10,
        minor_version: 0,
        patch_version: 0,
        build: "0",
      },
      application: 1,
      application_version: {
        major_version: 21,
        minor_version: 2,
        patch_version: 0,
        build: "0",
      },
    },
    uuid: { string: presentationUuid },
    name: opts.title,
    last_modified_date: buildTimestamp(now),
    category: opts.category,
    notes: opts.author,
    selected_arrangement: { string: arrangementUuid },
    arrangements: [
      {
        uuid: { string: arrangementUuid },
        name: "Main",
        group_identifiers: groupIds,
      },
    ],
    cue_groups: cueGroups,
    cues,
  };

  const err = PresentationType.verify(payload);
  if (err) {
    throw new Error(`Invalid ProPresenter .pro payload: ${err}`);
  }

  const message = PresentationType.create(payload);
  return Buffer.from(PresentationType.encode(message).finish());
}
