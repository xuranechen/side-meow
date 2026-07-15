const MODEL_PRICING = {
  "openai": {
    "gpt-4o": { input: 2.5, output: 10 },
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
    "gpt-4-turbo": { input: 10, output: 30 },
    "gpt-4": { input: 30, output: 60 },
    "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  },
  "anthropic": {
    "claude-sonnet-4-20250514": { input: 3, output: 15 },
    "claude-3-5-sonnet-20241022": { input: 3, output: 15 },
    "claude-3-5-haiku-20241022": { input: 0.8, output: 4 },
    "claude-3-opus-20240229": { input: 15, output: 75 },
    "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
  },
  "gemini": {
    "gemini-2.0-flash": { input: 0.1, output: 0.4 },
    "gemini-2.0-flash-lite": { input: 0.075, output: 0.3 },
    "gemini-1.5-pro": { input: 1.25, output: 5 },
    "gemini-1.5-flash": { input: 0.075, output: 0.3 },
  },
};

export function estimateCost(apiType, modelId, promptTokens, completionTokens) {
  const pricing = MODEL_PRICING[apiType]?.[modelId];
  if (!pricing) return null;
  
  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  
  return inputCost + outputCost;
}

export function formatCost(cost) {
  if (cost === null || cost === undefined) return "";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

export function formatTokens(tokens) {
  if (!tokens) return "0";
  if (tokens < 1000) return tokens.toString();
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1_000_000).toFixed(2)}M`;
}

export function getPricingInfo(apiType, modelId) {
  return MODEL_PRICING[apiType]?.[modelId] || null;
}
