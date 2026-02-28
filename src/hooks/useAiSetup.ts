import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  fetchGeminiModels,
  getDefaultModel,
  initializeAI,
  setActiveModel,
} from '../ai-service';
import { API_KEY_STORAGE_KEY, MODEL_STORAGE_KEY } from '../constants/storage';
import { getErrorMessage } from '../utils/error';

export interface UseAiSetupResult {
  apiKey: string;
  setApiKey: Dispatch<SetStateAction<string>>;
  isApiKeySet: boolean;
  modelOptions: string[];
  selectedModel: string;
  isModelLoading: boolean;
  setupError: string | null;
  modelWarning: string | null;
  isBootstrapping: boolean;
  submitApiKey: () => Promise<void>;
  changeModel: (modelId: string) => void;
}

export const useAiSetup = (): UseAiSetupResult => {
  const [apiKey, setApiKey] = useState('');
  const [isApiKeySet, setIsApiKeySet] = useState(false);
  const [modelOptions, setModelOptions] = useState<string[]>([getDefaultModel()]);
  const [selectedModel, setSelectedModel] = useState(getDefaultModel());
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [modelWarning, setModelWarning] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  const refreshModels = useCallback(async (key: string, preferredModel: string | null) => {
    setIsModelLoading(true);
    const result = await fetchGeminiModels(key);
    setModelWarning(result.warning || null);
    setModelOptions(result.models);

    const preferred = preferredModel?.trim() || '';
    const effectiveModel = result.models.includes(preferred) ? preferred : result.models[0];

    setSelectedModel(effectiveModel);
    setActiveModel(effectiveModel);
    localStorage.setItem(MODEL_STORAGE_KEY, effectiveModel);
    setIsModelLoading(false);
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      const storedApiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
      const storedModel = localStorage.getItem(MODEL_STORAGE_KEY);

      if (!storedApiKey) {
        setIsBootstrapping(false);
        return;
      }

      setApiKey(storedApiKey);
      setSetupError(null);

      try {
        initializeAI(storedApiKey);
        await refreshModels(storedApiKey, storedModel);
        setIsApiKeySet(true);
      } catch (error) {
        localStorage.removeItem(API_KEY_STORAGE_KEY);
        localStorage.removeItem(MODEL_STORAGE_KEY);
        setIsApiKeySet(false);
        setSetupError(`Stored API key is invalid: ${getErrorMessage(error)}`);
      } finally {
        setIsBootstrapping(false);
      }
    };

    void bootstrap();
  }, [refreshModels]);

  const submitApiKey = useCallback(async () => {
    const normalizedKey = apiKey.trim();
    if (!normalizedKey) return;

    setSetupError(null);
    setModelWarning(null);

    try {
      initializeAI(normalizedKey);
      await refreshModels(normalizedKey, localStorage.getItem(MODEL_STORAGE_KEY));
      localStorage.setItem(API_KEY_STORAGE_KEY, normalizedKey);
      setApiKey(normalizedKey);
      setIsApiKeySet(true);
    } catch (error) {
      setIsApiKeySet(false);
      setSetupError(getErrorMessage(error));
    }
  }, [apiKey, refreshModels]);

  const changeModel = useCallback((modelId: string) => {
    setSelectedModel(modelId);
    setActiveModel(modelId);
    localStorage.setItem(MODEL_STORAGE_KEY, modelId);
  }, []);

  return {
    apiKey,
    setApiKey,
    isApiKeySet,
    modelOptions,
    selectedModel,
    isModelLoading,
    setupError,
    modelWarning,
    isBootstrapping,
    submitApiKey,
    changeModel,
  };
};
