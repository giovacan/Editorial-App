export type BookType = 'novela' | 'ensayo' | 'poesia' | 'manual' | 'infantil';
export type PageFormat = 'a5' | '5x8' | 'a4' | '6x9' | '8x10' | 'letter';
export type ChapterType = 'chapter' | 'section';
export type TabName = 'structure' | 'config' | 'preview' | 'export';
export type PageNumberPos = 'top' | 'bottom';
export type PageNumberAlign = 'left' | 'center' | 'right' | 'outer';
export type HeaderContent = 'title' | 'chapter' | 'both';
export type TextAlign = 'left' | 'center' | 'right' | 'justify';
export type ChapterLayout = 'continuous' | 'withFirstParagraph' | 'titleOnly';

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

export interface Chapter {
  id: string;
  type: ChapterType;
  title: string;
  html: string;
  wordCount: number;
}

export interface Document {
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

export interface Config {
  pageFormat: PageFormat;
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  chaptersOnRight: boolean;
  showPageNumbers: boolean;
  pageNumberPos: PageNumberPos;
  pageNumberAlign: PageNumberAlign;
  showHeaders: boolean;
  headerContent: HeaderContent;
  headerPosition: 'top';
  headerLine: boolean;
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

export interface EditorState {
  bookData: Document;
  editing: Editing;
  config: Config;
  ui: UI;
  setBookData: (doc: Partial<Document>) => void;
  setConfig: (config: Partial<Config>) => void;
  setUi: (ui: Partial<UI>) => void;
  addChapter: (title?: string) => Chapter;
  addSection: (title?: string) => Chapter;
  updateChapter: (id: string, updates: Partial<Chapter>) => void;
  deleteChapter: (id: string) => void;
  setActiveChapter: (id: string | null) => void;
  loadContent: (chapters: Chapter[]) => void;
  newProject: () => void;
  getStats: () => Stats;
}
