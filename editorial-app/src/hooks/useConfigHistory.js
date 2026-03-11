import { useState, useCallback, useEffect, useRef } from 'react';

const HISTORY_KEY = 'editorial-app-history';
const MAX_HISTORY = 20;

const loadHistory = () => {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Error loading history:', e);
  }
  return null;
};

const saveHistory = (history) => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.error('Error saving history:', e);
  }
};

const getInitialState = () => {
  const saved = loadHistory();
  if (saved) {
    return saved;
  }
  return {
    past: [],
    present: null,
    future: [],
    changeLog: []
  };
};

export const useConfigHistory = (currentConfig) => {
  const [history, setHistory] = useState(getInitialState);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const isInitialized = useRef(false);
  const lastSavedConfig = useRef(null);

  useEffect(() => {
    if (!isInitialized.current && currentConfig) {
      isInitialized.current = true;
      lastSavedConfig.current = JSON.stringify(currentConfig);
      setHistory(prev => ({
        ...prev,
        present: currentConfig
      }));
    }
  }, [currentConfig]);

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  const pushChange = useCallback((action, config, force = false) => {
    const configJson = JSON.stringify(config);
    
    // Always allow content changes to be tracked, even if config hasn't changed
    if (!force && configJson === lastSavedConfig.current) return;
    
    lastSavedConfig.current = configJson;

    setHistory(prev => {
      const newPast = [...prev.past];
      if (prev.present) {
        newPast.push(prev.present);
        if (newPast.length > MAX_HISTORY) {
          newPast.shift();
        }
      }

      const newChangeLog = [...prev.changeLog, {
        id: Date.now(),
        timestamp: new Date(),
        action,
        config: JSON.parse(configJson)
      }].slice(-MAX_HISTORY);

      return {
        past: newPast,
        present: config,
        future: [],
        changeLog: newChangeLog
      };
    });
  }, []);

  const undo = useCallback(() => {
    let previous = null;
    setHistory(prev => {
      if (prev.past.length === 0) return prev;
      
      previous = prev.past[prev.past.length - 1];
      const newPast = prev.past.slice(0, -1);
      const newFuture = prev.present ? [prev.present, ...prev.future] : prev.future;
      
      lastSavedConfig.current = JSON.stringify(previous);
      
      return {
        past: newPast,
        present: previous,
        future: newFuture,
        changeLog: prev.changeLog
      };
    });
    return previous;
  }, []);

  const redo = useCallback(() => {
    let next = null;
    setHistory(prev => {
      if (prev.future.length === 0) return prev;
      
      next = prev.future[0];
      const newFuture = prev.future.slice(1);
      const newPast = prev.present ? [...prev.past, prev.present] : prev.past;
      
      lastSavedConfig.current = JSON.stringify(next);
      
      return {
        past: newPast,
        present: next,
        future: newFuture,
        changeLog: prev.changeLog
      };
    });
    return next;
  }, []);

  const restore = useCallback((config) => {
    const configJson = JSON.stringify(config);
    if (configJson === lastSavedConfig.current) return;
    
    lastSavedConfig.current = configJson;

    setHistory(prev => {
      const newPast = [...prev.past];
      if (prev.present) {
        newPast.push(prev.present);
        if (newPast.length > MAX_HISTORY) {
          newPast.shift();
        }
      }

      return {
        past: newPast,
        present: config,
        future: [],
        changeLog: [...prev.changeLog, {
          id: Date.now(),
          timestamp: new Date(),
          action: 'Restaurar versión anterior',
          config: JSON.parse(configJson)
        }]
      };
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory({
      past: [],
      present: currentConfig,
      future: [],
      changeLog: []
    });
    lastSavedConfig.current = JSON.stringify(currentConfig);
  }, [currentConfig]);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  return {
    history: history.present,
    pastLength: history.past.length,
    futureLength: history.future.length,
    changeLog: history.changeLog,
    canUndo,
    canRedo,
    pushChange,
    undo,
    redo,
    restore,
    clearHistory,
    showHistoryPanel,
    setShowHistoryPanel
  };
};

export default useConfigHistory;
