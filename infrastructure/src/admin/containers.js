import { readFile } from 'node:fs/promises';

export async function containerSnapshot({ filename = process.env.CONTAINER_SNAPSHOT_FILE, provider }) {
  if (!filename) return { available: false, stale: true, containers: [], message: 'Container collector is not configured.' };
  try {
    const raw = await readFile(filename, 'utf8');
    if (raw.length > 1024 * 1024) throw new Error('snapshot too large');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.containers) || data.containers.length > 32 || !Number.isFinite(Date.parse(data.collectedAt))) throw new Error('invalid snapshot');
    const age = Date.now() - Date.parse(data.collectedAt);
    const containers = data.containers.map((container) => {
      if (container.name !== 'dhamantaha-infrastructure-1') return container;
      const keys = provider.activeProvider !== 'gemini'
        ? [`${provider.label} · saved provider key`]
        : Array.from({ length: provider.keyCount }, (_, index) => index === 0 && provider.keySource === 'dashboard'
          ? 'Key 1 · dashboard override' : `Key ${index + 1} · ${index === 0 ? 'gemini.key' : `gemini.${index + 1}.key`}`);
      return { ...container, keyAssignments: keys, routing: provider.activeProvider === 'gemini' ? 'Starting key rotates per request; all slots remain available for fallback.' : 'Active saved provider profile.', model: provider.model };
    });
    return { available: true, stale: age < -5000 || age > 45_000, collectedAt: data.collectedAt, containers };
  } catch {
    return { available: false, stale: true, containers: [], message: 'Container snapshot unavailable. Check the host collector.' };
  }
}
