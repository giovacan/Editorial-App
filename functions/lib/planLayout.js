"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.planLayout = void 0;
const functions = __importStar(require("firebase-functions"));
const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = process.env.OPENAI_LAYOUT_MODEL || 'gpt-4.1-mini';
const REQUEST_TIMEOUT_MS = 8000;
const ALLOWED_POLICY_TAGS = new Set(['H1', 'H2', 'H3', 'BLOCKQUOTE', 'UL', 'OL']);
const ALLOWED_REPAIR_PRIORITIES = new Set(['widow', 'orphan', 'runt_line', 'heading_at_bottom']);
const LAYOUT_HINTS_SCHEMA = {
    name: 'layout_hints',
    schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            version: { type: 'string' },
            global: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    targetFillPct: { type: 'number' },
                    repairPriority: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                    avoidSplitTags: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                    keepWithNextTags: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                    notes: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                },
                required: ['targetFillPct', 'repairPriority', 'avoidSplitTags', 'keepWithNextTags', 'notes'],
            },
            chapters: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        chapterId: {
                            anyOf: [
                                { type: 'string' },
                                { type: 'null' },
                            ],
                        },
                        chapterTitle: { type: 'string' },
                        targetFillPct: { type: 'number' },
                        avoidSplitTags: {
                            type: 'array',
                            items: { type: 'string' },
                        },
                        keepWithNextTags: {
                            type: 'array',
                            items: { type: 'string' },
                        },
                        notes: {
                            type: 'array',
                            items: { type: 'string' },
                        },
                    },
                    required: ['chapterId', 'chapterTitle', 'targetFillPct', 'avoidSplitTags', 'keepWithNextTags', 'notes'],
                },
            },
        },
        required: ['version', 'global', 'chapters'],
    },
    strict: true,
};
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const normalizeTagList = (value) => {
    if (!Array.isArray(value))
        return [];
    const tags = new Set();
    for (const item of value) {
        const tag = String(item || '').toUpperCase();
        if (ALLOWED_POLICY_TAGS.has(tag))
            tags.add(tag);
    }
    return [...tags];
};
const normalizeRepairPriority = (value) => {
    const items = Array.isArray(value) ? value : [];
    const result = items
        .map((item) => String(item || ''))
        .filter((item) => ALLOWED_REPAIR_PRIORITIES.has(item));
    return result.length > 0 ? result : ['widow', 'orphan', 'runt_line'];
};
const sanitizeNotes = (value) => {
    if (!Array.isArray(value))
        return [];
    return value
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 8);
};
const sanitizeLayoutHints = (raw, request) => {
    const candidate = (typeof raw === 'object' && raw !== null ? raw : {});
    const baseTarget = clamp(Number(request?.config?.targetFillPct ?? 0.92), 0.82, 0.95);
    const chapters = Array.isArray(request.chapters) ? request.chapters : [];
    const global = candidate.global || {};
    const chapterHintsByKey = new Map();
    for (const chapter of Array.isArray(candidate.chapters) ? candidate.chapters : []) {
        const key = `${chapter.chapterId || ''}::${chapter.chapterTitle || ''}`;
        chapterHintsByKey.set(key, chapter);
    }
    return {
        version: String(candidate.version || `remote-openai-${DEFAULT_MODEL}`),
        global: {
            targetFillPct: clamp(Number(global.targetFillPct ?? baseTarget), 0.82, 0.95),
            repairPriority: normalizeRepairPriority(global.repairPriority),
            avoidSplitTags: normalizeTagList(global.avoidSplitTags),
            keepWithNextTags: normalizeTagList(global.keepWithNextTags),
            notes: sanitizeNotes(global.notes),
        },
        chapters: chapters.map((chapter) => {
            const key = `${chapter.id || ''}::${chapter.title || ''}`;
            const hint = chapterHintsByKey.get(key);
            return {
                chapterId: chapter.id || null,
                chapterTitle: chapter.title || '',
                targetFillPct: clamp(Number(hint?.targetFillPct ?? global.targetFillPct ?? baseTarget), 0.82, 0.95),
                avoidSplitTags: normalizeTagList(hint?.avoidSplitTags),
                keepWithNextTags: normalizeTagList(hint?.keepWithNextTags),
                notes: sanitizeNotes(hint?.notes),
            };
        }),
    };
};
const buildSystemPrompt = () => [
    'You are an editorial layout policy planner for a deterministic pagination engine.',
    'Return conservative layout hints, not line breaks or page-by-page instructions.',
    'Prefer stable policies the engine can enforce: targetFillPct, avoidSplitTags, keepWithNextTags, repairPriority, notes.',
    'Use only these tags when relevant: H1, H2, H3, BLOCKQUOTE, UL, OL.',
    'Lower targetFillPct only when the manuscript benefits from white space, such as reflective prose, poetry-like rhythm, frequent blockquotes, or list-heavy chapters.',
    'Do not invent unsupported tags or aggressive policies.',
].join(' ');
const buildUserPrompt = (request) => JSON.stringify({
    task: 'Produce layout policy hints for this manuscript so a deterministic paginator can make better editorial choices.',
    manuscript: request,
}, null, 2);
const extractResponseText = (responsePayload) => {
    if (typeof responsePayload?.output_text === 'string' && responsePayload.output_text.trim()) {
        return responsePayload.output_text;
    }
    const outputs = Array.isArray(responsePayload?.output) ? responsePayload.output : [];
    for (const output of outputs) {
        const content = Array.isArray(output?.content) ? output.content : [];
        for (const item of content) {
            if (typeof item?.text === 'string' && item.text.trim())
                return item.text;
            if (typeof item?.value === 'string' && item.value.trim())
                return item.value;
        }
    }
    return '';
};
const callOpenAIPlanner = async (request) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new functions.https.HttpsError('failed-precondition', 'OPENAI_API_KEY is not configured');
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: DEFAULT_MODEL,
                reasoning: { effort: 'low' },
                max_output_tokens: 900,
                text: {
                    format: {
                        type: 'json_schema',
                        ...LAYOUT_HINTS_SCHEMA,
                    },
                },
                input: [
                    {
                        role: 'system',
                        content: [{ type: 'input_text', text: buildSystemPrompt() }],
                    },
                    {
                        role: 'user',
                        content: [{ type: 'input_text', text: buildUserPrompt(request) }],
                    },
                ],
            }),
            signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok) {
            throw new functions.https.HttpsError('internal', `OpenAI request failed: ${payload?.error?.message || response.statusText}`);
        }
        const responseText = extractResponseText(payload);
        if (!responseText) {
            throw new functions.https.HttpsError('internal', 'OpenAI returned no structured text');
        }
        return sanitizeLayoutHints(JSON.parse(responseText), request);
    }
    catch (error) {
        if (error instanceof functions.https.HttpsError)
            throw error;
        if (error?.name === 'AbortError') {
            throw new functions.https.HttpsError('deadline-exceeded', 'Layout planner timed out');
        }
        throw new functions.https.HttpsError('internal', `Layout planner failed: ${error?.message || String(error)}`);
    }
    finally {
        clearTimeout(timeoutId);
    }
};
exports.planLayout = functions.https.onCall(async (data, context) => {
    if (!context.auth || !context.auth.uid) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
    }
    const chapters = Array.isArray(data?.chapters) ? data.chapters : [];
    if (chapters.length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Planner requires at least one chapter');
    }
    const safeRequest = {
        chapters: chapters.slice(0, 150).map((chapter) => ({
            id: chapter.id || null,
            title: String(chapter.title || '').slice(0, 180),
            excerpt: String(chapter.excerpt || '').slice(0, 1800),
            stats: {
                wordCount: Number(chapter.stats?.wordCount || 0),
                paragraphCount: Number(chapter.stats?.paragraphCount || 0),
                headingCount: Number(chapter.stats?.headingCount || 0),
                blockquoteCount: Number(chapter.stats?.blockquoteCount || 0),
                listCount: Number(chapter.stats?.listCount || 0),
            },
        })),
        config: {
            pageFormat: data?.config?.pageFormat || 'a5',
            fontFamily: data?.config?.fontFamily || null,
            fontSize: data?.config?.fontSize || null,
            lineHeight: data?.config?.lineHeight || null,
            targetFillPct: data?.config?.targetFillPct ?? 0.92,
            chapterTitleLayout: data?.config?.chapterTitleLayout || null,
            minOrphanLines: data?.config?.minOrphanLines ?? 2,
            minWidowLines: data?.config?.minWidowLines ?? 2,
        },
        layoutCtx: {
            contentWidth: data?.layoutCtx?.contentWidth || null,
            contentHeight: data?.layoutCtx?.contentHeight || null,
            lineHeightPx: data?.layoutCtx?.lineHeightPx || null,
        },
    };
    const layoutHints = await callOpenAIPlanner(safeRequest);
    return { layoutHints };
});
//# sourceMappingURL=planLayout.js.map