export declare function measureHtmlHeight(html: string, layoutCtx: {
  baseFontSizePx: number;
  baseLineHeight: number;
  contentWidth: number;
  fontFamily?: string;
  lineHeightPx?: number;
}): number;

export declare function createLayoutContext(config: Record<string, unknown>): unknown;
export declare function calculateLineHeightPx(fontSize: number, lineHeight: number): number;
export declare function countHtmlLines(html: string, layoutCtx: unknown): number;
export declare function ensureFontsReady(fontFamily: string, fontSize: number): Promise<void>;
export declare function applyKpRendering(el: HTMLElement, config: unknown): void;
export declare function insertHtmlLineBreaks(html: string, layoutCtx: unknown): string;
export declare function getLineBreakPositions(text: string, layoutCtx: unknown): number[];
export declare function buildFontString(weight: string, sizePx: number, family: string): string;
