import {
  buildWebLLMMessages,
  extractJsonObject,
  resolveWebLLMModelTier,
  selectWebLLMModel,
} from '../services/layoutPlanner.shared.js';

let webllmModulePromise = null;
let enginePromise = null;
let activeModelId = '';
let activeModelLabel = '';
let operationQueue = Promise.resolve();

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const queueOperation = (task) => {
  operationQueue = operationQueue.then(task, task);
  return operationQueue;
};

const getWebLLMModule = async () => {
  if (!webllmModulePromise) {
    webllmModulePromise = import('@mlc-ai/web-llm');
  }
  return webllmModulePromise;
};

const normalizeProgressValue = (progress) => {
  if (typeof progress === 'number' && Number.isFinite(progress)) {
    return clamp(progress <= 1 ? Math.round(progress * 100) : Math.round(progress), 0, 100);
  }
  if (progress && typeof progress === 'object') {
    if (typeof progress.progress === 'number' && Number.isFinite(progress.progress)) {
      return clamp(progress.progress <= 1 ? Math.round(progress.progress * 100) : Math.round(progress.progress), 0, 100);
    }
    if (typeof progress.percentage === 'number' && Number.isFinite(progress.percentage)) {
      return clamp(Math.round(progress.percentage), 0, 100);
    }
  }
  return 0;
};

const normalizeProgressReason = (progress) => {
  if (typeof progress === 'string') {
    return progress;
  }
  if (progress && typeof progress === 'object') {
    return String(progress.text || progress.message || 'loading_model');
  }
  return 'loading_model';
};

const extractAssistantText = (response) => {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        return '';
      })
      .join('');
  }
  return '';
};

const postStatus = ({ phase, progress = 0, reason = '', modelLabel = activeModelLabel }) => {
  self.postMessage({
    type: 'STATUS',
    provider: 'webllm',
    phase,
    progress,
    reason,
    modelLabel,
  });
};

const resolveModelRecord = async ({ modelTier, modelId }) => {
  const webllm = await getWebLLMModule();
  const effectiveTier = resolveWebLLMModelTier({ VITE_WEBLLM_MODEL_TIER: modelTier });
  const selected = selectWebLLMModel(
    webllm?.prebuiltAppConfig?.model_list || [],
    effectiveTier,
    modelId || ''
  );

  if (!selected) {
    throw new Error('no WebLLM model matched the requested tier');
  }

  return selected;
};

const ensureEngine = async ({ modelTier, modelId }) => {
  if (enginePromise) {
    return enginePromise;
  }

  enginePromise = (async () => {
    const webllm = await getWebLLMModule();
    const modelRecord = await resolveModelRecord({ modelTier, modelId });
    const selectedModelId = modelRecord?.model_id || modelRecord?.modelId;

    activeModelId = selectedModelId;
    activeModelLabel = selectedModelId;

    postStatus({
      phase: 'loading',
      progress: 0,
      reason: 'initializing_webllm',
      modelLabel: activeModelLabel,
    });

    const engine = await webllm.CreateMLCEngine(selectedModelId, {
      initProgressCallback: (progress) => {
        postStatus({
          phase: 'loading',
          progress: normalizeProgressValue(progress),
          reason: normalizeProgressReason(progress),
          modelLabel: activeModelLabel,
        });
      },
    });

    postStatus({
      phase: 'ready',
      progress: 100,
      reason: 'webllm_ready',
      modelLabel: activeModelLabel,
    });

    return engine;
  })().catch((error) => {
    enginePromise = null;
    activeModelId = '';
    activeModelLabel = '';
    throw error;
  });

  return enginePromise;
};

const handleInit = async (data) => {
  await ensureEngine(data);
  self.postMessage({
    type: 'INIT_DONE',
    requestId: data.requestId,
    modelId: activeModelId,
    modelLabel: activeModelLabel,
  });
};

const handlePlan = async (data) => {
  if (!enginePromise) {
    throw new Error('webllm engine is not ready');
  }

  const engine = await enginePromise;
  const messages = buildWebLLMMessages(data.payload);
  const response = await engine.chat.completions.create({
    messages,
    temperature: 0.15,
    top_p: 0.9,
    max_tokens: 500,
    stream: false,
    response_format: { type: 'json_object' },
  });

  const content = extractAssistantText(response);
  const layoutHints = extractJsonObject(content);

  if (!layoutHints) {
    throw new Error('webllm returned invalid JSON');
  }

  self.postMessage({
    type: 'PLAN_RESULT',
    requestId: data.requestId,
    modelId: activeModelId,
    modelLabel: activeModelLabel,
    layoutHints,
  });
};

self.onmessage = ({ data }) => {
  if (!data?.type) return;

  queueOperation(async () => {
    if (data.type === 'INIT') {
      await handleInit(data);
      return;
    }

    if (data.type === 'PLAN') {
      await handlePlan(data);
    }
  }).catch((error) => {
    self.postMessage({
      type: data.type === 'INIT' ? 'INIT_ERROR' : 'PLAN_ERROR',
      requestId: data.requestId,
      message: error?.message || String(error),
      modelLabel: activeModelLabel,
    });
  });
};
