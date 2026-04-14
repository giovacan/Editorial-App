export const DEFAULT_LAYOUT_PLANNER_PROVIDER = 'local';
export const DEFAULT_WEBLLM_MODEL_TIER = 'balanced';
export const VALID_LAYOUT_PLANNER_PROVIDERS = ['local', 'webllm', 'remote'];
export const VALID_WEBLLM_MODEL_TIERS = ['fast', 'balanced', 'quality'];
export const DEFAULT_REPAIR_PRIORITY = ['widow', 'orphan', 'runt_line'];
export const DEFAULT_MIN_LAST_LINE_WORDS = 6;
export const ALLOWED_HINT_TAGS = new Set(['H1', 'H2', 'H3', 'BLOCKQUOTE', 'UL', 'OL']);

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const stripHtml = (html = '') => html
  .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
  .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const excerptText = (text = '', maxLen = 1200) => {
  if (text.length <= maxLen) return text;
  const head = text.slice(0, Math.floor(maxLen * 0.7));
  const tail = text.slice(-Math.floor(maxLen * 0.3));
  return `${head} ... ${tail}`;
};

export const buildPlannerPayload = (chapters, safeConfig = {}, layoutCtx = {}) => ({
  chapters: (Array.isArray(chapters) ? chapters : []).map((chapter) => {
    const plainText = stripHtml(chapter?.html || '');
    return {
      id: chapter?.id || null,
      title: chapter?.title || '',
      excerpt: excerptText(plainText, 1400),
      stats: {
        wordCount: plainText ? plainText.split(/\s+/).filter(Boolean).length : 0,
        paragraphCount: ((chapter?.html || '').match(/<(p|div)\b/gi) || []).length,
        headingCount: ((chapter?.html || '').match(/<h[1-6]\b/gi) || []).length,
        blockquoteCount: ((chapter?.html || '').match(/<blockquote\b/gi) || []).length,
        listCount: (((chapter?.html || '').match(/<ul\b/gi) || []).length) + (((chapter?.html || '').match(/<ol\b/gi) || []).length),
        avgWordLength: (() => {
          const words = plainText ? plainText.split(/\s+/).filter(Boolean) : [];
          return words.length > 0
            ? Number((words.reduce((s, w) => s + w.length, 0) / words.length).toFixed(1))
            : 5;
        })(),
      },
    };
  }),
  config: {
    pageFormat: safeConfig?.pageFormat || 'a5',
    fontFamily: safeConfig?.fontFamily || null,
    fontSize: safeConfig?.fontSize || null,
    lineHeight: safeConfig?.lineHeight || null,
    targetFillPct: safeConfig?.pagination?.targetFillPct ?? 0.92,
    chapterTitleLayout: safeConfig?.chapterTitle?.layout || 'continuous',
    minOrphanLines: safeConfig?.pagination?.minOrphanLines ?? 2,
    minWidowLines: safeConfig?.pagination?.minWidowLines ?? 2,
  },
  layoutCtx: {
    contentWidth: layoutCtx?.contentWidth || null,
    contentHeight: layoutCtx?.contentHeight || null,
    lineHeightPx: layoutCtx?.lineHeightPx || null,
  },
});

export const resolvePlannerProvider = ({ env = {}, hasFunctions = false } = {}) => {
  const configured = String(env?.VITE_LAYOUT_PLANNER_PROVIDER || '').trim().toLowerCase();
  if (VALID_LAYOUT_PLANNER_PROVIDERS.includes(configured)) {
    return configured;
  }
  if (env?.VITE_ENABLE_AI_LAYOUT_PLANNER === 'true' && hasFunctions) {
    return 'remote';
  }
  return DEFAULT_LAYOUT_PLANNER_PROVIDER;
};

export const resolveWebLLMModelTier = (env = {}) => {
  const configured = String(env?.VITE_WEBLLM_MODEL_TIER || '').trim().toLowerCase();
  return VALID_WEBLLM_MODEL_TIERS.includes(configured) ? configured : DEFAULT_WEBLLM_MODEL_TIER;
};

const getModelId = (record) => String(record?.model_id || record?.modelId || '').trim();

const isInstructModel = (record) => /(?:^|[-_ ])(?:instruct|chat|it)(?:$|[-_ ])/i.test(getModelId(record));

const getTierMatchers = (tier) => {
  switch (tier) {
    case 'fast':
      return [
        /qwen.*0\.5b/i,
        /phi[- ]?3.*mini/i,
        /qwen.*1\.5b/i,
        /gemma.*2b/i,
        /llama.*1b/i,
      ];
    case 'quality':
      return [
        /gemma.*2b/i,
        /qwen.*1\.5b/i,
        /llama.*3b/i,
        /phi[- ]?3.*mini/i,
        /mistral.*7b/i,
      ];
    case 'balanced':
    default:
      return [
        /qwen.*1\.5b/i,
        /gemma.*2b/i,
        /phi[- ]?3.*mini/i,
        /llama.*3b/i,
        /qwen.*0\.5b/i,
      ];
  }
};

export const selectWebLLMModel = (modelList = [], tier = DEFAULT_WEBLLM_MODEL_TIER, explicitModelId = '') => {
  const records = (Array.isArray(modelList) ? modelList : []).filter((record) => getModelId(record));
  if (records.length === 0) return null;

  const normalizedExplicit = String(explicitModelId || '').trim().toLowerCase();
  if (normalizedExplicit) {
    return records.find((record) => getModelId(record).toLowerCase() === normalizedExplicit) || null;
  }

  const instructRecords = records.filter(isInstructModel);
  const searchSpace = instructRecords.length > 0 ? instructRecords : records;
  const matchers = getTierMatchers(tier);

  for (const matcher of matchers) {
    const match = searchSpace.find((record) => matcher.test(getModelId(record)));
    if (match) return match;
  }

  return searchSpace[0] || null;
};

export const buildWebLLMMessages = (payload) => {
  const plannerSchema = {
    version: 'webllm-local-v1',
    global: {
      targetFillPct: 0.9,
      minLastLineWords: DEFAULT_MIN_LAST_LINE_WORDS,
      repairPriority: DEFAULT_REPAIR_PRIORITY,
      avoidSplitTags: ['BLOCKQUOTE'],
      keepWithNextTags: ['H1', 'H2', 'H3'],
      notes: ['short_snake_case_note'],
    },
    chapters: [
      {
        chapterId: 'chapter-id',
        chapterTitle: 'Chapter title',
        targetFillPct: 0.88,
        minLastLineWords: DEFAULT_MIN_LAST_LINE_WORDS,
        avoidSplitTags: ['BLOCKQUOTE'],
        keepWithNextTags: ['H1', 'H2', 'H3'],
        notes: ['chapter_note'],
      },
    ],
  };

  return [
    {
      role: 'system',
      content: [
        'You are an editorial layout planner for a deterministic pagination engine.',
        'Return valid JSON only. Do not use markdown. Do not include explanations.',
        'Keep the response concise and conservative.',
        'Only use these HTML tag names in arrays: H1, H2, H3, BLOCKQUOTE, UL, OL.',
        'Keep targetFillPct between 0.82 and 0.95.',
        `Keep minLastLineWords between 4 and 8, defaulting to ${DEFAULT_MIN_LAST_LINE_WORDS}.`,
        'For Spanish manuscripts with many short connector words (y, a, en, de, la), increase minLastLineWords to 7 or 8 because 6 short words can render visually narrower than 3 long words.',
        'Avoid split paragraphs that leave a last line shorter than minLastLineWords on either the head chunk (page A) or the continuation chunk (page B).',
        'Keep repairPriority as an ordered subset of widow, orphan, runt_line.',
        'Do not invent chapter IDs or chapter titles.',
        `Follow this shape: ${JSON.stringify(plannerSchema)}`,
      ].join(' '),
    },
    {
      role: 'user',
      content: JSON.stringify(payload),
    },
  ];
};

export const extractJsonObject = (rawText) => {
  if (rawText == null) return null;
  const text = String(rawText).trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    // fall through
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // fall through
    }
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }

  return null;
};

const normalizeStringArray = (value) => (
  Array.isArray(value)
    ? [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
    : []
);

const normalizeTagArray = (value, fallback = []) => {
  const tags = normalizeStringArray(value)
    .map((tag) => tag.toUpperCase())
    .filter((tag) => ALLOWED_HINT_TAGS.has(tag));
  return tags.length > 0 ? tags : normalizeStringArray(fallback).map((tag) => tag.toUpperCase());
};

const normalizeRepairPriority = (value, fallback = DEFAULT_REPAIR_PRIORITY) => {
  const allowed = new Set(DEFAULT_REPAIR_PRIORITY);
  const normalized = normalizeStringArray(value).filter((item) => allowed.has(item));
  return normalized.length > 0 ? normalized : [...fallback];
};

const normalizeMinLastLineWords = (value, fallback = DEFAULT_MIN_LAST_LINE_WORDS) => {
  const numeric = Number(value);
  const safeValue = Number.isFinite(numeric) ? Math.round(numeric) : Number(fallback);
  return clamp(safeValue, 4, 8);
};

const normalizeTargetFillPct = (value, fallback = 0.92) => {
  const numeric = Number(value);
  const safeValue = Number.isFinite(numeric) ? numeric : Number(fallback);
  return Number(clamp(Number(safeValue.toFixed(2)), 0.82, 0.95).toFixed(2));
};

const getChapterLookupKey = (chapter) => {
  const chapterId = String(chapter?.chapterId || '').trim();
  if (chapterId) return `id:${chapterId.toLowerCase()}`;
  const chapterTitle = String(chapter?.chapterTitle || '').trim();
  if (chapterTitle) return `title:${chapterTitle.toLowerCase()}`;
  return '';
};

const normalizeChapterHints = (remoteChapter, fallbackChapter) => ({
  chapterId: remoteChapter?.chapterId ?? fallbackChapter?.chapterId ?? null,
  chapterTitle: remoteChapter?.chapterTitle ?? fallbackChapter?.chapterTitle ?? '',
  targetFillPct: normalizeTargetFillPct(remoteChapter?.targetFillPct, fallbackChapter?.targetFillPct ?? 0.92),
  minLastLineWords: normalizeMinLastLineWords(remoteChapter?.minLastLineWords, fallbackChapter?.minLastLineWords ?? DEFAULT_MIN_LAST_LINE_WORDS),
  avoidSplitTags: normalizeTagArray(remoteChapter?.avoidSplitTags, fallbackChapter?.avoidSplitTags || []),
  keepWithNextTags: normalizeTagArray(remoteChapter?.keepWithNextTags, fallbackChapter?.keepWithNextTags || []),
  notes: normalizeStringArray(remoteChapter?.notes ?? fallbackChapter?.notes ?? []),
});

export const normalizePlannerHints = (candidate, localHints) => {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const localGlobal = localHints?.global || {};
  const remoteGlobal = candidate?.global || {};

  const localChapters = Array.isArray(localHints?.chapters) ? localHints.chapters : [];
  const candidateChapters = Array.isArray(candidate?.chapters) ? candidate.chapters : [];
  const remoteByKey = new Map(
    candidateChapters
      .map((chapter) => [getChapterLookupKey(chapter), chapter])
      .filter(([key]) => key)
  );

  let acceptedRemoteFields = 0;
  if (Number.isFinite(Number(remoteGlobal?.targetFillPct))) acceptedRemoteFields++;
  if (Number.isFinite(Number(remoteGlobal?.minLastLineWords))) acceptedRemoteFields++;
  if (Array.isArray(remoteGlobal?.repairPriority)) acceptedRemoteFields++;
  if (Array.isArray(remoteGlobal?.avoidSplitTags)) acceptedRemoteFields++;
  if (Array.isArray(remoteGlobal?.keepWithNextTags)) acceptedRemoteFields++;
  if (Array.isArray(remoteGlobal?.notes)) acceptedRemoteFields++;

  const chapters = localChapters.length > 0
    ? localChapters.map((chapter) => {
      const key = getChapterLookupKey(chapter);
      const remoteChapter = remoteByKey.get(key);
      if (remoteChapter) {
        if (Number.isFinite(Number(remoteChapter?.targetFillPct))) acceptedRemoteFields++;
        if (Number.isFinite(Number(remoteChapter?.minLastLineWords))) acceptedRemoteFields++;
        if (Array.isArray(remoteChapter?.avoidSplitTags)) acceptedRemoteFields++;
        if (Array.isArray(remoteChapter?.keepWithNextTags)) acceptedRemoteFields++;
        if (Array.isArray(remoteChapter?.notes)) acceptedRemoteFields++;
      }
      return normalizeChapterHints(remoteChapter, chapter);
    })
    : candidateChapters.map((chapter) => {
      if (Number.isFinite(Number(chapter?.targetFillPct))) acceptedRemoteFields++;
      if (Number.isFinite(Number(chapter?.minLastLineWords))) acceptedRemoteFields++;
      if (Array.isArray(chapter?.avoidSplitTags)) acceptedRemoteFields++;
      if (Array.isArray(chapter?.keepWithNextTags)) acceptedRemoteFields++;
      if (Array.isArray(chapter?.notes)) acceptedRemoteFields++;
      return normalizeChapterHints(chapter, null);
    });

  if (acceptedRemoteFields === 0) {
    return null;
  }

  return {
    version: String(candidate?.version || localHints?.version || 'layout-planner'),
    global: {
      targetFillPct: normalizeTargetFillPct(remoteGlobal?.targetFillPct, localGlobal?.targetFillPct ?? 0.92),
      minLastLineWords: normalizeMinLastLineWords(remoteGlobal?.minLastLineWords, localGlobal?.minLastLineWords ?? DEFAULT_MIN_LAST_LINE_WORDS),
      repairPriority: normalizeRepairPriority(remoteGlobal?.repairPriority, localGlobal?.repairPriority || DEFAULT_REPAIR_PRIORITY),
      avoidSplitTags: normalizeTagArray(remoteGlobal?.avoidSplitTags, localGlobal?.avoidSplitTags || []),
      keepWithNextTags: normalizeTagArray(remoteGlobal?.keepWithNextTags, localGlobal?.keepWithNextTags || []),
      notes: normalizeStringArray(remoteGlobal?.notes ?? localGlobal?.notes ?? []),
    },
    chapters,
  };
};

export const mergeLayoutHints = (localHints, candidate) => {
  const normalized = normalizePlannerHints(candidate, localHints);
  if (!normalized) {
    return localHints;
  }

  return {
    ...localHints,
    ...normalized,
    global: {
      ...(localHints?.global || {}),
      ...(normalized.global || {}),
    },
    chapters: Array.isArray(normalized.chapters) && normalized.chapters.length > 0
      ? normalized.chapters
      : (localHints?.chapters || []),
  };
};
