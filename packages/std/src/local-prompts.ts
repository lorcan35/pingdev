// @pingdev/std — Prompt templates (cloud + local variants)

export interface PromptTemplate {
  system: string;
  userTemplate: string;
}

const JSON_ONLY = 'RESPOND WITH ONLY VALID JSON. No explanation, no markdown, no code fences. Generate REAL concrete values. NEVER copy example placeholders like "..." or "example". Every field must contain actual extracted/generated content.';

export function getQueryPrompt(local: boolean): PromptTemplate {
  if (!local) {
    return {
      system: `Return JSON only. Selector + short reasoning. ${JSON_ONLY}`,
      userTemplate: `Question: {{question}}\nDOM:\n{{dom}}\nReturn JSON only: {"selector":"...","reasoning":"short"}\n${JSON_ONLY}`,
    };
  }
  return {
    system: `Return JSON only. ${JSON_ONLY}`,
    userTemplate: `Find one best CSS selector for question.\nq={{question}}\ndom={{dom}}\nReturn: {"selector":"css","reasoning":"short"}\n${JSON_ONLY}`,
  };
}

export function getHealPrompt(local: boolean): PromptTemplate {
  if (!local) {
    return {
      system: JSON_ONLY,
      userTemplate: `Fix this broken CSS selector and return JSON only.\n\nfailed_selector: {{selector}}\noperation: {{operation}}\nerror: {{error}}\nurl: {{url}}\n\nRules:\n- Prefer: id > data-testid > aria-label > role > stable class > attribute selector\n- Avoid generated/hash classes (css-*, sc-*, random hashes)\n- Return one best selector\n\nDOM:\n{{dom}}\n\nOutput JSON:\n{"selector":"...","confidence":0.0,"reasoning":"short"}\n${JSON_ONLY}`,
    };
  }
  return {
    system: `Return JSON only. ${JSON_ONLY}`,
    userTemplate: `Repair CSS selector.\nselector={{selector}}\nop={{operation}}\nerror={{error}}\nurl={{url}}\ndom={{dom}}\nReturn: {"selector":"css","confidence":0.0,"reasoning":"short"}\n${JSON_ONLY}`,
  };
}

export function getSuggestPrompt(local: boolean): PromptTemplate {
  if (!local) {
    return {
      system: `Return JSON only: {"suggestion": string, "confidence": number(0..1)}. ${JSON_ONLY}`,
      userTemplate: `Device: {{deviceId}}\nPage context: {{context}}\nUser question: {{question}}\n${JSON_ONLY}`,
    };
  }
  return {
    system: `Return JSON only. ${JSON_ONLY}`,
    userTemplate: `device={{deviceId}}\ncontext={{context}}\nq={{question}}\nReturn: {"suggestion":"text","confidence":0.0}\n${JSON_ONLY}`,
  };
}

export function getGeneratePrompt(local: boolean): PromptTemplate {
  if (!local) {
    return {
      system: `Return JSON only using the required keys. ${JSON_ONLY}`,
      userTemplate: `Generate PingApp JSON.\nurl: {{url}}\ndescription: {{description}}\n{{domContext}}\n\nReturn JSON only with keys:\n{name,url,description,selectors,actions,schemas}\nUse a domain-specific app name (for example: github-app, amazon-app), never generic site-app.\nExample:\n{"name":"github-app","url":"https://github.com","description":"Search repositories","selectors":{"search_input":"input[name='q']"},"actions":[{"name":"search","op":"type","selector":"input[name='q']","value":"{{query}}"}],"schemas":[{"name":"results","fields":{"title":"h3 a"}}]}\n${JSON_ONLY}`,
    };
  }
  return {
    system: `Return JSON only. ${JSON_ONLY}`,
    userTemplate: `Build PingApp spec for url={{url}} desc={{description}}\n{{domContext}}\nUse a domain-specific app name like github-app, never site-app.\nReturn: {"name":"github-app","url":"https://...","description":"...","selectors":{"key":"css"},"actions":[{"name":"search","op":"type","selector":"input[name='q']","value":"{{query}}"}],"schemas":[{"name":"main","fields":{"title":"h3 a"}}]}\n${JSON_ONLY}`,
  };
}

export function getDiscoverPrompt(local: boolean): PromptTemplate {
  if (!local) {
    return {
      system: `Return JSON object mapping field names to CSS selectors. ${JSON_ONLY}`,
      userTemplate: `query: {{query}}\nurl: {{url}}\ntitle: {{title}}\nelements:\n{{elements}}\nReturn JSON object mapping field names to CSS selectors.\nExample: {"titles":"h2.post-title","prices":".price"}\n${JSON_ONLY}`,
    };
  }
  return {
    system: `Return JSON only. ${JSON_ONLY}`,
    userTemplate: `Map extraction fields to CSS selectors.\nquery={{query}}\nurl={{url}}\ntitle={{title}}\nelements={{elements}}\nReturn: {"field":"selector"}\n${JSON_ONLY}`,
  };
}

export function getExtractPrompt(local: boolean): PromptTemplate {
  return getDiscoverPrompt(local);
}

export function getVisualPrompt(local: boolean): PromptTemplate {
  if (!local) {
    return {
      system: `Return JSON only from screenshot content. ${JSON_ONLY}`,
      userTemplate: `Extract JSON from webpage screenshot.\nfields:\n{{fields}}\nReturn JSON only. Missing fields => null.\nExample: {"title":"...","price":null}\n${JSON_ONLY}`,
    };
  }
  return {
    system: `Return JSON only. ${JSON_ONLY}`,
    userTemplate: `Extract fields from screenshot/text.\nfields={{fields}}\nReturn: {"field":null}\n${JSON_ONLY}`,
  };
}

export function getPaginatePrompt(local: boolean): PromptTemplate {
  if (!local) {
    return {
      system: `Return JSON only: {field: cssSelector}. ${JSON_ONLY}`,
      userTemplate: `query={{query}}\ndom={{dom}}\nReturn JSON schema map for extraction.\n${JSON_ONLY}`,
    };
  }
  return {
    system: `Return JSON only. ${JSON_ONLY}`,
    userTemplate: `Given query and dom, return extraction schema selector map.\nq={{query}}\ndom={{dom}}\nReturn: {"field":"selector"}\n${JSON_ONLY}`,
  };
}
