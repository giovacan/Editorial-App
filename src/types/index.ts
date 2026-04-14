export type BookType = 'novela' | 'ensayo' | 'poesia' | 'manual' | 'infantil';
export type PageFormat = 'a5' | '5x8' | 'a4' | '6x9' | '8x10' | 'letter' | 'half-letter' | 'custom';
export type GutterStrategy = 'auto' | 'custom';
export type PageFormatUnit = 'mm' | 'cm' | 'in';
export type ChapterType = 'chapter' | 'section';
export type TabName = 'structure' | 'config' | 'preview' | 'export';
export type PageNumberPos = 'top' | 'bottom';
export type PageNumberAlign = 'paragraph-edge' | 'paragraph' | 'outer' | 'center';
export type FrontMatterNumbering = 'roman' | 'arabic' | 'none';
export type HeaderContent = 'title' | 'chapter' | 'both';
export type TextAlign = 'left' | 'center' | 'right' | 'justify';
export type ChapterLayout = 'continuous' | 'spaced' | 'halfPage' | 'fullPage';

// Header Template Types
export type HeaderTemplateId = 'classic' | 'modern' | 'minimal' | 'academic' | 'literary' | 'custom';
export type HeaderCellContent = 'title' | 'chapter' | 'subheader' | 'page' | 'none';
export type HeaderLineStyle = 'solid' | 'dashed' | 'dotted' | 'double';
export type HeaderFontStyle = 'same' | 'sans' | 'small-caps';
export type SubheaderFormat = 'full' | 'short' | 'numbered';
export type PaginationConflictResolution = 'stack' | 'merge' | 'separate';
export type HeaderDisplayMode = 'alternate' | 'both' | 'even-only' | 'odd-only';

export interface SubheaderLevelConfig {
  align: TextAlign;
  bold: boolean;
  sizeMultiplier: number;
  marginTop: number;
  marginBottom: number;
  minLinesAfter: number;
}

export interface ChapterTitleConfig {
  align: TextAlign;
  bold: boolean;
  sizeMultiplier: number;
  marginTop: number;
  marginBottom: number;
  startOnRightPage: boolean;
  layout: ChapterLayout;
  showLines: boolean;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted' | 'double';
  lineColor: string;
  lineWidthTitle: boolean;
  hierarchyEnabled: boolean;
  hierarchyLabelSizeMultiplier: number;
  hierarchyTitleSizeMultiplier: number;
  hierarchyLabelColor: string;
  hierarchyLabelBold: boolean;
  hierarchyGap: number;
}

export interface ParagraphConfig {
  firstLineIndent: number;
  align: TextAlign;
  spacingBetween: number;
}

export interface QuoteConfig {
  enabled: boolean;
  indentLeft: number;
  indentRight: number;
  showLine: boolean;
  italic: boolean;
  sizeMultiplier: number;
  marginTop: number;
  marginBottom: number;
}

export interface PaginationRules {
  minOrphanLines: number;
  minWidowLines: number;
  splitLongParagraphs: boolean;
}

// Header Configuration Interfaces
export interface HeaderPageConfig {
  leftContent: HeaderCellContent;
  centerContent: HeaderCellContent;
  rightContent: HeaderCellContent;
}

// Subtopic behavior type
export type SubtopicBehavior = 'none' | 'replace' | 'combine' | 'odd-only' | 'even-only';

export interface HeaderConfig {
  enabled: boolean;
  template: HeaderTemplateId;
  displayMode: HeaderDisplayMode;
  evenPage: HeaderPageConfig;
  oddPage: HeaderPageConfig;
  trackSubheaders: boolean;
  trackPseudoHeaders: boolean;
  subtopicBehavior: SubtopicBehavior;
  subtopicSeparator: string;
  subtopicMaxLength: number;
  subheaderLevels: string[];
  subheaderFormat: SubheaderFormat;
  fontFamily: HeaderFontStyle;
  fontSize: number;
  showLine: boolean;
  lineStyle: HeaderLineStyle;
  lineWidth: number;
  lineColor: 'black' | 'gray' | 'light-gray';
  marginTop: number;
  marginBottom: number;
  distanceFromPageNumber: number;
  whenPaginationSamePosition: PaginationConflictResolution;
  skipFirstChapterPage: boolean;
}

export interface Chapter {
  id: string;
  type: ChapterType;
  title: string;
  html: string;
  wordCount: number;
  isCover?: boolean;
}

export interface Document {
  id?: string;
  title: string;
  author: string;
  chapters: Chapter[];
  bookType: BookType;
  pageFormat: PageFormat;
  margins: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
}

export interface Editing {
  activeChapterId: string | null;
  isDirty: boolean;
}

export interface CustomPageFormat {
  width: number;
  height: number;
  unit: PageFormatUnit;
}

export interface Config {
  pageFormat: PageFormat;
  customPageFormat: CustomPageFormat;
  gutterStrategy: GutterStrategy;
  gutterManual: number;
  gutterUnit: 'in' | 'mm' | 'cm';
  extraEndPages: number;
  extraEndPagesNumbered: boolean;
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  chaptersOnRight: boolean;
  showPageNumbers: boolean;
  pageNumberPos: PageNumberPos;
  pageNumberAlign: PageNumberAlign;
  pageNumberMargin: number;
  showHeaders: boolean;
  headerContent: HeaderContent;
  headerPosition: 'top';
  headerLine: boolean;
  header: HeaderConfig;
  chapterTitle: ChapterTitleConfig;
  subheaders: {
    h1: SubheaderLevelConfig;
    h2: SubheaderLevelConfig;
    h3: SubheaderLevelConfig;
    h4: SubheaderLevelConfig;
    h5: SubheaderLevelConfig;
    h6: SubheaderLevelConfig;
  };
  paragraph: ParagraphConfig;
  quote: QuoteConfig;
  pagination: PaginationRules;
  previewDebug: PreviewDebugConfig;
}

export interface PreviewDebugConfig {
  enabled: boolean;
  elements: {
    headers: boolean;
    paragraphs: boolean;
    quotes: boolean;
  };
  spacing: {
    indent: boolean;
    paragraphGap: boolean;
  };
  pageBreaks: {
    showEndOfPage: boolean;
    showContinued: boolean;
  };
  dimensions: {
    margins: boolean;
    gutter: boolean;
    pageSize: boolean;
  };
}

export interface UI {
  showPreview: boolean;
  showUpload: boolean;
  activeTab: TabName;
}

export interface Stats {
  chapters: number;
  words: number;
  characters: number;
  pages: number;
  readingTime: number;
}

export interface PaginationProgress {
  isActive: boolean;
  percent: number;
}

export type LayoutPlannerProvider = 'local' | 'webllm' | 'remote';
export type LayoutPlannerPhase = 'idle' | 'loading' | 'ready' | 'fallback';

export interface LayoutPlannerState {
  provider: LayoutPlannerProvider;
  phase: LayoutPlannerPhase;
  progress: number;
  modelLabel: string;
  reason: string;
  revision: number;
}

export type TOCResolvedEntry = {
  title: string;
  level: number;
  chapterIndex: number;
  elementId?: string;
  page: number;
};

export type TOCConfig = {
  includeLevels: number[];
  title: string;
  includeDots: boolean;
  fontSize: number;
  marginTop: number;
  autoGenerated: boolean;
};

export interface EditorState {
  bookData: Document;
  editing: Editing;
  config: Config;
  ui: UI;
  paginationProgress: PaginationProgress;
  layoutPlanner: LayoutPlannerState;
  confirmedChapterTitles: string[];
  paginatedPages: any[];
  layoutDims: any | null;
  paginationLog: any | null;
  tocBuildLog: any[] | null;
  tocData: TOCResolvedEntry[] | null;
  tocConfig: TOCConfig | null;
  tocAuto: boolean;
  frontMatterPages: any[];
  frontMatterConfig: any;
  showTOCPanel: boolean;
  setBookData: (doc: Partial<Document>) => void;
  setConfig: (config: Partial<Config>) => void;
  setUi: (ui: Partial<UI>) => void;
  setPaginationProgress: (percent: number) => void;
  setLayoutPlannerState: (state: Partial<LayoutPlannerState>) => void;
  bumpLayoutPlannerRevision: () => void;
  startPagination: () => void;
  endPagination: () => void;
  addChapter: (title?: string) => Chapter;
  addSection: (title?: string) => Chapter;
  updateChapter: (id: string, updates: Partial<Chapter>) => void;
  deleteChapter: (id: string) => void;
  setActiveChapter: (id: string | null) => void;
  loadContent: (chapters: Chapter[]) => void;
  newProject: () => void;
  getStats: () => Stats;
  setConfirmedChapterTitles: (titles: string[]) => void;
  setPaginatedPages: (pages: any[]) => void;
  setLayoutDims: (dims: any) => void;
  setPaginationLog: (log: any) => void;
  setTocBuildLog: (log: any[] | null) => void;
  setTOCData: (data: TOCResolvedEntry[] | null) => void;
  setTOCConfig: (config: TOCConfig | null) => void;
  setTOCAuto: (auto: boolean) => void;
  setFrontMatterPages: (pages: any[]) => void;
  setFrontMatterConfig: (config: any) => void;
  setShowTOCPanel: (show: boolean) => void;
}

// ===== AUTH & USER TYPES =====

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export type SubscriptionPlan = 'free' | 'pro' | 'premium';

export interface Subscription {
  plan: SubscriptionPlan;
  credits: number;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  status?: 'active' | 'past_due' | 'canceled' | 'trialing';
  currentPeriodEnd?: Date | null;
  expiresAt?: Date | null;
}

export interface PlanConfig {
  maxBooks: number;      // -1 = unlimited
  maxExports: number;    // -1 = unlimited
  features: string[];
  price?: number;
}

export interface SystemConfig {
  stripePublishableKey: string;
  stripeWebhookSecret?: string;
  stripePriceIdPro: string;
  stripePriceIdPremium: string;
  plans: {
    free: PlanConfig;
    pro: PlanConfig;
    premium: PlanConfig;
  };
  maintenanceMode: boolean;
  registrationEnabled: boolean;
  appVersion: string;
  updatedAt: Date;
  updatedBy: string;
}
