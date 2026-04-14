import { describe, expect, it } from 'vitest';
import {
  buildPlannerPayload,
  extractJsonObject,
  mergeLayoutHints,
  resolvePlannerProvider,
  selectWebLLMModel,
} from './layoutPlanner.shared';

describe('layoutPlanner.shared', () => {
  it('selects planner provider from new env flag and remote legacy flag', () => {
    expect(resolvePlannerProvider({ env: {}, hasFunctions: false })).toBe('local');
    expect(resolvePlannerProvider({
      env: { VITE_LAYOUT_PLANNER_PROVIDER: 'webllm' },
      hasFunctions: false,
    })).toBe('webllm');
    expect(resolvePlannerProvider({
      env: { VITE_ENABLE_AI_LAYOUT_PLANNER: 'true' },
      hasFunctions: true,
    })).toBe('remote');
  });

  it('selects balanced WebLLM models with override support', () => {
    const modelList = [
      { model_id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC' },
      { model_id: 'gemma-2-2b-it-q4f16_1-MLC' },
      { model_id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC' },
      { model_id: 'Phi-3.5-mini-instruct-q4f16_0-MLC' },
    ];

    expect(selectWebLLMModel(modelList, 'balanced')?.model_id)
      .toBe('Qwen2.5-1.5B-Instruct-q4f16_1-MLC');
    expect(selectWebLLMModel(modelList, 'balanced', 'Phi-3.5-mini-instruct-q4f16_0-MLC')?.model_id)
      .toBe('Phi-3.5-mini-instruct-q4f16_0-MLC');
  });

  it('extracts JSON from fenced text and merges normalized layout hints', () => {
    const localHints = {
      version: 'local-heuristic-v1',
      global: {
        targetFillPct: 0.92,
        minLastLineWords: 6,
        repairPriority: ['widow', 'orphan', 'runt_line'],
        avoidSplitTags: ['BLOCKQUOTE'],
        keepWithNextTags: ['H1', 'H2', 'H3'],
        notes: ['local_default'],
      },
      chapters: [
        {
          chapterId: 'ch-1',
          chapterTitle: 'Capitulo 1',
          targetFillPct: 0.9,
          minLastLineWords: 6,
          avoidSplitTags: [],
          keepWithNextTags: ['H1', 'H2', 'H3'],
          notes: ['local_chapter'],
        },
      ],
    };

    const parsed = extractJsonObject('```json\n{"global":{"targetFillPct":0.86,"minLastLineWords":7},"chapters":[{"chapterId":"ch-1","avoidSplitTags":["blockquote","script"],"minLastLineWords":5}]}\n```');
    const merged = mergeLayoutHints(localHints, parsed);

    expect(merged.global.targetFillPct).toBe(0.86);
    expect(merged.global.minLastLineWords).toBe(7);
    expect(merged.chapters[0].minLastLineWords).toBe(5);
    expect(merged.chapters[0].avoidSplitTags).toEqual(['BLOCKQUOTE']);
    expect(merged.chapters[0].keepWithNextTags).toEqual(['H1', 'H2', 'H3']);
  });

  it('builds a stable planner payload from manuscript chapters', () => {
    const payload = buildPlannerPayload(
      [{ id: 'ch-1', title: 'Capitulo 1', html: '<h1>Capitulo</h1><p>Texto de prueba</p>' }],
      { pageFormat: 'a5', pagination: { targetFillPct: 0.91 } },
      { contentWidth: 420, contentHeight: 680, lineHeightPx: 24 }
    );

    expect(payload.chapters[0]).toEqual(expect.objectContaining({
      id: 'ch-1',
      title: 'Capitulo 1',
      stats: expect.objectContaining({
        wordCount: 4,
        headingCount: 1,
        paragraphCount: 1,
      }),
    }));
    expect(payload.layoutCtx.contentWidth).toBe(420);
    expect(payload.config.targetFillPct).toBe(0.91);
  });
});
