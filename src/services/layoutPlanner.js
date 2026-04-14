import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import useEditorStore from '../store/useEditorStore';
import { planLayoutHints as planLocalLayoutHints } from '../utils/layoutPlanner';
import {
  buildPlannerPayload,
  mergeLayoutHints,
  resolvePlannerProvider,
  resolveWebLLMModelTier,
} from './layoutPlanner.shared';

const REMOTE_TIMEOUT_MS = 3500;
const WEBLLM_PLAN_TIMEOUT_MS = 4500;
const WEBLLM_INIT_TIMEOUT_MS = 120000;

const DEFAULT_PLANNER_STATE = {
  provider: 'local',
  phase: 'idle',
  progress: 0,
  modelLabel: '',
  reason: 'not_initialized',
  revision: 0,
};

const defaultWorkerFactory = () => new Worker(
  new URL('../workers/layoutPlannerWorker.js', import.meta.url),
  { type: 'module' }
);

const defaultWebGPUSupportDetector = () => typeof navigator !== 'undefined' && !!navigator.gpu;

let plannerWorkerFactory = defaultWorkerFactory;
let webgpuSupportDetector = defaultWebGPUSupportDetector;
let envOverride = null;

let plannerWorker = null;
let nextWorkerRequestId = 1;
const pendingWorkerRequests = new Map();

const webllmRuntime = {
  initStarted: false,
  ready: false,
  modelLabel: '',
};

const getPlannerEnv = () => envOverride || import.meta.env || {};

const getCallable = (functionName) => {
  if (typeof functions?.httpsCallable === 'function') {
    return functions.httpsCallable(functionName);
  }
  return httpsCallable(functions, functionName);
};

const withTimeout = async (promise, timeoutMs, label) => {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const updatePlannerState = (patch = {}, { bumpRevision = false } = {}) => {
  const store = useEditorStore.getState?.();
  if (!store?.setLayoutPlannerState) return;

  store.setLayoutPlannerState(patch);
  if (bumpRevision && store.bumpLayoutPlannerRevision) {
    store.bumpLayoutPlannerRevision();
  }
};

const rejectPendingWorkerRequests = (error) => {
  for (const [, pending] of pendingWorkerRequests) {
    pending.reject(error);
  }
  pendingWorkerRequests.clear();
};

const resetWebLLMRuntime = () => {
  webllmRuntime.initStarted = false;
  webllmRuntime.ready = false;
  webllmRuntime.modelLabel = '';
};

const teardownPlannerWorker = (error = null) => {
  if (plannerWorker) {
    plannerWorker.terminate();
    plannerWorker = null;
  }
  if (error) {
    rejectPendingWorkerRequests(error);
  }
  resetWebLLMRuntime();
};

const handleWorkerStatus = (message) => {
  if (!message) return;

  const patch = {
    provider: message.provider || 'webllm',
    phase: message.phase || 'loading',
    progress: Number.isFinite(Number(message.progress)) ? Number(message.progress) : 0,
    modelLabel: message.modelLabel || webllmRuntime.modelLabel || '',
    reason: message.reason || '',
  };

  const becameReady = message.phase === 'ready' && !webllmRuntime.ready;
  if (message.phase === 'ready') {
    webllmRuntime.ready = true;
  }
  if (patch.modelLabel) {
    webllmRuntime.modelLabel = patch.modelLabel;
  }

  updatePlannerState(patch, { bumpRevision: becameReady });
};

const handlePlannerWorkerMessage = ({ data }) => {
  if (!data?.type) return;

  if (data.type === 'STATUS') {
    handleWorkerStatus(data);
    return;
  }

  const pending = pendingWorkerRequests.get(data.requestId);
  if (!pending) return;

  pendingWorkerRequests.delete(data.requestId);
  clearTimeout(pending.timer);

  if (data.type === 'INIT_DONE' || data.type === 'PLAN_RESULT') {
    pending.resolve(data);
    return;
  }

  pending.reject(new Error(data.message || 'layout planner worker error'));
};

const handlePlannerWorkerError = (event) => {
  const lastModelLabel = webllmRuntime.modelLabel;
  const error = new Error(
    `layout planner worker error: ${event?.message || '(no message)'}`
  );
  teardownPlannerWorker(error);
  updatePlannerState({
    provider: 'local',
    phase: 'fallback',
    progress: 0,
    modelLabel: lastModelLabel,
    reason: 'webllm_worker_error',
  });
};

const ensurePlannerWorker = () => {
  if (plannerWorker) {
    return plannerWorker;
  }

  plannerWorker = plannerWorkerFactory();
  plannerWorker.onmessage = handlePlannerWorkerMessage;
  plannerWorker.onerror = handlePlannerWorkerError;
  return plannerWorker;
};

const postWorkerRequest = (type, payload = {}, timeoutMs = WEBLLM_PLAN_TIMEOUT_MS) => {
  const worker = ensurePlannerWorker();
  const requestId = nextWorkerRequestId++;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingWorkerRequests.delete(requestId);
      reject(new Error(`${type.toLowerCase()} timeout`));
    }, timeoutMs);

    pendingWorkerRequests.set(requestId, { resolve, reject, timer });
    worker.postMessage({ type, requestId, ...payload });
  });
};

const startWebLLMInitialization = () => {
  if (webllmRuntime.initStarted) {
    return;
  }

  webllmRuntime.initStarted = true;
  updatePlannerState({
    provider: 'webllm',
    phase: 'loading',
    progress: 0,
    modelLabel: webllmRuntime.modelLabel,
    reason: 'initializing_webllm',
  });

  const env = getPlannerEnv();
  postWorkerRequest(
    'INIT',
    {
      modelTier: resolveWebLLMModelTier(env),
      modelId: env.VITE_WEBLLM_MODEL_ID || '',
    },
    WEBLLM_INIT_TIMEOUT_MS
  ).then((message) => {
    if (message?.modelLabel) {
      webllmRuntime.modelLabel = message.modelLabel;
    }
  }).catch((error) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[layoutPlanner] WebLLM init failed, using local planner.', error);
    }
    teardownPlannerWorker();
    updatePlannerState({
      provider: 'local',
      phase: 'fallback',
      progress: 0,
      modelLabel: '',
      reason: error?.message || 'webllm_init_failed',
    });
  });
};

const getRemoteLayoutHints = async (localHints, chapters, safeConfig, layoutCtx) => {
  if (!functions) {
    updatePlannerState({
      provider: 'local',
      phase: 'fallback',
      progress: 0,
      modelLabel: '',
      reason: 'remote_unavailable',
    });
    return localHints;
  }

  try {
    const callPlanLayout = getCallable('planLayout');
    const payload = buildPlannerPayload(chapters, safeConfig, layoutCtx);
    const result = await withTimeout(callPlanLayout(payload), REMOTE_TIMEOUT_MS, 'layout planner timeout');
    const mergedHints = mergeLayoutHints(localHints, result?.data?.layoutHints ?? result?.data ?? null);

    if (mergedHints === localHints) {
      updatePlannerState({
        provider: 'local',
        phase: 'fallback',
        progress: 0,
        modelLabel: '',
        reason: 'remote_invalid_response',
      });
      return localHints;
    }

    updatePlannerState({
      provider: 'remote',
      phase: 'ready',
      progress: 100,
      modelLabel: 'Cloud Function',
      reason: 'remote_planner_ready',
    });
    return mergedHints;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[layoutPlanner] Remote planner unavailable, using local hints.', error);
    }
    updatePlannerState({
      provider: 'local',
      phase: 'fallback',
      progress: 0,
      modelLabel: '',
      reason: error?.message || 'remote_unavailable',
    });
    return localHints;
  }
};

const getWebLLMLayoutHints = async (localHints, chapters, safeConfig, layoutCtx) => {
  if (!webgpuSupportDetector()) {
    updatePlannerState({
      provider: 'local',
      phase: 'fallback',
      progress: 0,
      modelLabel: '',
      reason: 'webgpu_unavailable',
    });
    return localHints;
  }

  startWebLLMInitialization();

  if (!webllmRuntime.ready) {
    updatePlannerState({
      provider: 'webllm',
      phase: 'loading',
      progress: useEditorStore.getState?.().layoutPlanner?.progress ?? 0,
      modelLabel: webllmRuntime.modelLabel,
      reason: 'warming_webllm',
    });
    return localHints;
  }

  try {
    const payload = buildPlannerPayload(chapters, safeConfig, layoutCtx);
    const result = await postWorkerRequest('PLAN', { payload }, WEBLLM_PLAN_TIMEOUT_MS);
    const mergedHints = mergeLayoutHints(localHints, result?.layoutHints ?? null);

    if (mergedHints === localHints) {
      updatePlannerState({
        provider: 'local',
        phase: 'fallback',
        progress: 0,
        modelLabel: webllmRuntime.modelLabel,
        reason: 'webllm_invalid_response',
      });
      return localHints;
    }

    updatePlannerState({
      provider: 'webllm',
      phase: 'ready',
      progress: 100,
      modelLabel: result?.modelLabel || webllmRuntime.modelLabel,
      reason: 'webllm_ready',
    });
    return mergedHints;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[layoutPlanner] WebLLM planner failed, using local hints.', error);
    }
    updatePlannerState({
      provider: 'local',
      phase: 'fallback',
      progress: 0,
      modelLabel: webllmRuntime.modelLabel,
      reason: error?.message || 'webllm_plan_failed',
    });
    return localHints;
  }
};

export async function getLayoutHints(chapters, safeConfig = {}, layoutCtx = {}) {
  const localHints = planLocalLayoutHints(chapters, safeConfig);
  const provider = resolvePlannerProvider({
    env: getPlannerEnv(),
    hasFunctions: !!functions,
  });

  if (provider === 'remote') {
    return getRemoteLayoutHints(localHints, chapters, safeConfig, layoutCtx);
  }

  if (provider === 'webllm') {
    return getWebLLMLayoutHints(localHints, chapters, safeConfig, layoutCtx);
  }

  updatePlannerState({
    ...DEFAULT_PLANNER_STATE,
    provider: 'local',
    phase: 'ready',
    progress: 100,
    reason: 'local_planner_active',
  });
  return localHints;
}

export const __setLayoutPlannerTestOverrides = (overrides = {}) => {
  if (Object.prototype.hasOwnProperty.call(overrides, 'workerFactory')) {
    plannerWorkerFactory = overrides.workerFactory || defaultWorkerFactory;
  }
  if (Object.prototype.hasOwnProperty.call(overrides, 'supportsWebGPU')) {
    webgpuSupportDetector = overrides.supportsWebGPU || defaultWebGPUSupportDetector;
  }
  if (Object.prototype.hasOwnProperty.call(overrides, 'env')) {
    envOverride = overrides.env || null;
  }
};

export const __resetLayoutPlannerForTests = () => {
  teardownPlannerWorker();
  plannerWorkerFactory = defaultWorkerFactory;
  webgpuSupportDetector = defaultWebGPUSupportDetector;
  envOverride = null;
  nextWorkerRequestId = 1;
  updatePlannerState(DEFAULT_PLANNER_STATE);
};
