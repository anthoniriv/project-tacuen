// lib/ia/openaiClient.ts
import OpenAI from "openai";

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _openai;
}

// Lazy proxy: defers OpenAI client construction until the OCR path actually runs,
// so `next build` (and the WebMCP demo, which never calls OpenAI) succeeds even
// without OPENAI_API_KEY set. The real client is only built on first use.
export const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    return Reflect.get(getOpenAI(), prop);
  },
});
