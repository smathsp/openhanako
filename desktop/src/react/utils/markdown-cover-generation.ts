import { hanaFetch } from '../hooks/use-hana-fetch';
import { useStore } from '../stores';
import registry from '../../shared/theme-registry';

export type CoverThemeTone = 'light' | 'dark';

export function getCoverThemeTone(): CoverThemeTone {
  const theme = document.documentElement.getAttribute('data-theme') || document.documentElement.dataset.theme || '';
  return registry.isPaperTextureBlockedTheme(theme) ? 'dark' : 'light';
}

export async function requestMarkdownCoverGeneration({
  filePath,
  userGuidance,
}: {
  filePath: string;
  userGuidance?: string;
}): Promise<{ ok: true; activity?: unknown } | { ok: false; error: string }> {
  const res = await hanaFetch('/api/desk/beautify/cover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filePath,
      themeTone: getCoverThemeTone(),
      agentId: useStore.getState().currentAgentId || undefined,
      ...(userGuidance?.trim() ? { userGuidance: userGuidance.trim() } : {}),
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error) {
    return { ok: false, error: data?.error || `HTTP ${res.status}` };
  }
  return { ok: true, activity: data?.activity };
}

export function dispatchCoverNotice(text: string, type: 'success' | 'error' = 'success'): void {
  window.dispatchEvent(new CustomEvent('hana-inline-notice', {
    detail: { text, type },
  }));
}
