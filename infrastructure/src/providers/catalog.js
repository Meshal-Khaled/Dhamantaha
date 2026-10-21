// API roots used by The Ring's provider adapters. These are upstream URLs, not the app's /v1 URL.
export const PROVIDER_CATALOG = [
  { type: 'gemini', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', protocol: 'gemini', images: true, pdf: true },
  { type: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', protocol: 'compatible', images: true, pdf: true },
  { type: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', protocol: 'anthropic', images: true, pdf: true },
  { type: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', protocol: 'compatible', images: true, pdf: true },
  { type: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', protocol: 'compatible', images: true, pdf: false },
  { type: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', protocol: 'compatible', images: false, pdf: false },
  { type: 'mistral', label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', protocol: 'compatible', images: true, pdf: false },
  { type: 'xai', label: 'Grok · xAI', baseUrl: 'https://api.x.ai/v1', protocol: 'compatible', images: true, pdf: false },
  { type: 'custom', label: 'Custom provider', baseUrl: '', protocol: 'compatible', images: true, pdf: false },
];
export const presetFor = (type) => PROVIDER_CATALOG.find((entry) => entry.type === type);
