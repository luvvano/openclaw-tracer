export interface TracerTrackConfig {
  sessions: boolean;
  llm_calls: boolean;
  tools: boolean;
  tool_args: boolean;
  skills: boolean;
  subagents: boolean;
  commands: boolean;
  hooks: boolean;
}

export interface TracerConfig {
  enabled: boolean;
  track: TracerTrackConfig;
  mask_sensitive: boolean;
  max_sessions: number;
}

const DEFAULTS: TracerConfig = {
  enabled: true,
  track: {
    sessions: true,
    llm_calls: true,
    tools: true,
    tool_args: true,
    skills: true,
    subagents: true,
    commands: true,
    hooks: false,
  },
  mask_sensitive: true,
  max_sessions: 500,
};

const SENSITIVE_KEYS = ["token", "key", "password", "secret", "auth", "credential", "apikey", "api_key"];

export function getConfig(pluginConfig?: Record<string, unknown>): TracerConfig {
  if (!pluginConfig) return { ...DEFAULTS, track: { ...DEFAULTS.track } };
  const track = (pluginConfig.track as Partial<TracerTrackConfig>) ?? {};
  return {
    enabled: (pluginConfig.enabled as boolean) ?? DEFAULTS.enabled,
    mask_sensitive: (pluginConfig.mask_sensitive as boolean) ?? DEFAULTS.mask_sensitive,
    max_sessions: (pluginConfig.max_sessions as number) ?? DEFAULTS.max_sessions,
    track: {
      sessions:   track.sessions   ?? DEFAULTS.track.sessions,
      llm_calls:  track.llm_calls  ?? DEFAULTS.track.llm_calls,
      tools:      track.tools      ?? DEFAULTS.track.tools,
      tool_args:  track.tool_args  ?? DEFAULTS.track.tool_args,
      skills:     track.skills     ?? DEFAULTS.track.skills,
      subagents:  track.subagents  ?? DEFAULTS.track.subagents,
      commands:   track.commands   ?? DEFAULTS.track.commands,
      hooks:      track.hooks      ?? DEFAULTS.track.hooks,
    },
  };
}

export function maskSensitiveParams(params: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    const keyLower = k.toLowerCase();
    const isSensitive = SENSITIVE_KEYS.some(s => keyLower.includes(s));
    if (isSensitive) {
      result[k] = "***";
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      result[k] = maskSensitiveParams(v as Record<string, unknown>);
    } else {
      result[k] = v;
    }
  }
  return result;
}
