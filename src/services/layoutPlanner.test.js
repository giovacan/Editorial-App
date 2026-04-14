import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const localHints = {
    version: 'local-heuristic-v1',
    global: {
      targetFillPct: 0.92,
      minLastLineWords: 6,
      repairPriority: ['widow', 'orphan', 'runt_line'],
      avoidSplitTags: [],
      keepWithNextTags: ['H1', 'H2', 'H3'],
      notes: ['local_default'],
    },
    chapters: [
      {
        chapterId: 'ch-1',
        chapterTitle: 'Capitulo 1',
        targetFillPct: 0.92,
        minLastLineWords: 6,
        avoidSplitTags: [],
        keepWithNextTags: ['H1', 'H2', 'H3'],
        notes: ['local_default'],
      },
    ],
  };

  const storeState = {
    layoutPlanner: {
      provider: 'local',
      phase: 'idle',
      progress: 0,
      modelLabel: '',
      reason: '',
      revision: 0,
    },
    setLayoutPlannerState: vi.fn((patch) => {
      storeState.layoutPlanner = {
        ...storeState.layoutPlanner,
        ...patch,
      };
    }),
    bumpLayoutPlannerRevision: vi.fn(() => {
      storeState.layoutPlanner = {
        ...storeState.layoutPlanner,
        revision: storeState.layoutPlanner.revision + 1,
      };
    }),
  };

  return {
    localHints,
    storeState,
    planLocalLayoutHints: vi.fn(() => localHints),
  };
});

vi.mock('../utils/layoutPlanner', () => ({
  planLayoutHints: hoisted.planLocalLayoutHints,
}));

vi.mock('../store/useEditorStore', () => ({
  default: {
    getState: () => hoisted.storeState,
  },
}));

vi.mock('./firebase', () => ({
  functions: null,
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
}));

import {
  __resetLayoutPlannerForTests,
  __setLayoutPlannerTestOverrides,
  getLayoutHints,
} from './layoutPlanner';

const nextTick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

class FakeWebLLMWorker {
  constructor({ planResponse }) {
    this.planResponse = planResponse;
    this.onmessage = null;
    this.onerror = null;
    this.terminated = false;
  }

  postMessage(message) {
    if (message.type === 'INIT') {
      queueMicrotask(() => {
        this.onmessage?.({
          data: {
            type: 'STATUS',
            provider: 'webllm',
            phase: 'loading',
            progress: 24,
            modelLabel: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
            reason: 'loading_model',
          },
        });
      });

      queueMicrotask(() => {
        this.onmessage?.({
          data: {
            type: 'STATUS',
            provider: 'webllm',
            phase: 'ready',
            progress: 100,
            modelLabel: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
            reason: 'webllm_ready',
          },
        });
        this.onmessage?.({
          data: {
            type: 'INIT_DONE',
            requestId: message.requestId,
            modelLabel: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
          },
        });
      });
      return;
    }

    if (message.type === 'PLAN') {
      queueMicrotask(() => {
        this.onmessage?.({
          data: {
            type: 'PLAN_RESULT',
            requestId: message.requestId,
            modelLabel: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
            layoutHints: this.planResponse,
          },
        });
      });
    }
  }

  terminate() {
    this.terminated = true;
  }
}

describe('layoutPlanner service', () => {
  beforeEach(() => {
    hoisted.planLocalLayoutHints.mockClear();
    hoisted.storeState.layoutPlanner = {
      provider: 'local',
      phase: 'idle',
      progress: 0,
      modelLabel: '',
      reason: '',
      revision: 0,
    };
    hoisted.storeState.setLayoutPlannerState.mockClear();
    hoisted.storeState.bumpLayoutPlannerRevision.mockClear();
    __resetLayoutPlannerForTests();
  });

  afterEach(() => {
    __resetLayoutPlannerForTests();
  });

  it('falls back to the local planner when WebGPU is unavailable', async () => {
    __setLayoutPlannerTestOverrides({
      env: { VITE_LAYOUT_PLANNER_PROVIDER: 'webllm' },
      supportsWebGPU: () => false,
    });

    const result = await getLayoutHints(
      [{ id: 'ch-1', title: 'Capitulo 1', html: '<p>Texto</p>' }],
      {},
      {}
    );

    expect(result).toBe(hoisted.localHints);
    expect(hoisted.storeState.setLayoutPlannerState).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'local',
      phase: 'fallback',
      reason: 'webgpu_unavailable',
    }));
  });

  it('uses local hints while WebLLM is warming up and retries with AI hints once ready', async () => {
    __setLayoutPlannerTestOverrides({
      env: { VITE_LAYOUT_PLANNER_PROVIDER: 'webllm' },
      supportsWebGPU: () => true,
      workerFactory: () => new FakeWebLLMWorker({
        planResponse: {
          version: 'webllm-local-v1',
          global: {
            targetFillPct: 0.86,
            minLastLineWords: 7,
            keepWithNextTags: ['H1', 'H2', 'H3'],
            avoidSplitTags: ['BLOCKQUOTE'],
          },
          chapters: [
            {
              chapterId: 'ch-1',
              targetFillPct: 0.85,
              minLastLineWords: 5,
              avoidSplitTags: ['BLOCKQUOTE'],
              keepWithNextTags: ['H1', 'H2', 'H3'],
            },
          ],
        },
      }),
    });

    const firstResult = await getLayoutHints(
      [{ id: 'ch-1', title: 'Capitulo 1', html: '<blockquote>Texto</blockquote>' }],
      {},
      {}
    );

    expect(firstResult).toBe(hoisted.localHints);
    expect(['loading', 'ready']).toContain(hoisted.storeState.layoutPlanner.phase);

    await nextTick();

    const secondResult = await getLayoutHints(
      [{ id: 'ch-1', title: 'Capitulo 1', html: '<blockquote>Texto</blockquote>' }],
      {},
      {}
    );

    expect(secondResult.global.targetFillPct).toBe(0.86);
    expect(secondResult.global.minLastLineWords).toBe(7);
    expect(secondResult.chapters[0].targetFillPct).toBe(0.85);
    expect(secondResult.chapters[0].minLastLineWords).toBe(5);
    expect(secondResult.chapters[0].avoidSplitTags).toEqual(['BLOCKQUOTE']);
    expect(hoisted.storeState.bumpLayoutPlannerRevision).toHaveBeenCalledTimes(1);
  });

  it('falls back to the local planner when WebLLM returns invalid hints', async () => {
    __setLayoutPlannerTestOverrides({
      env: { VITE_LAYOUT_PLANNER_PROVIDER: 'webllm' },
      supportsWebGPU: () => true,
      workerFactory: () => new FakeWebLLMWorker({
        planResponse: {
          global: {
            targetFillPct: 'not-a-number',
          },
          chapters: [
            {
              chapterId: 'other-chapter',
            },
          ],
        },
      }),
    });

    await getLayoutHints(
      [{ id: 'ch-1', title: 'Capitulo 1', html: '<p>Texto</p>' }],
      {},
      {}
    );
    await nextTick();

    const result = await getLayoutHints(
      [{ id: 'ch-1', title: 'Capitulo 1', html: '<p>Texto</p>' }],
      {},
      {}
    );

    expect(result).toBe(hoisted.localHints);
    expect(hoisted.storeState.layoutPlanner.provider).toBe('local');
    expect(hoisted.storeState.layoutPlanner.phase).toBe('fallback');
  });
});
