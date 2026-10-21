import { readFile } from 'node:fs/promises';

export async function containerSnapshot({ filename = process.env.CONTAINER_SNAPSHOT_FILE, provider }) {
  if (!filename) return { available: false, stale: true, containers: [], message: 'Container collector is not configured.' };
  try {
    const raw = await readFile(filename, 'utf8');
    if (raw.length > 1024 * 1024) throw new Error('snapshot too large');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.containers) || data.containers.length > 32 || !Number.isFinite(Date.parse(data.collectedAt))) throw new Error('invalid snapshot');
    const age = Date.now() - Date.parse(data.collectedAt);
    const containers = data.containers.filter((container) => ['dhamantaha-website-website-1', 'dhamantaha-qr-1'].includes(container.name)).map((container) => {
      if (container.name !== 'dhamantaha-qr-1') return container;
      return { ...container, routing: 'Shared QR backend · starting key rotates across the three Ring Gemini keys.' };
    });
    return { available: true, stale: age < -5000 || age > 45_000, collectedAt: data.collectedAt, containers, requests: data.qrUsage?.requests ?? [] };
  } catch {
    return { available: false, stale: true, containers: [], message: 'Container snapshot unavailable. Check the host collector.' };
  }
}

export async function qrUsers({ filename = process.env.CONTAINER_SNAPSHOT_FILE } = {}) {
  try {
    const data = JSON.parse(await readFile(filename, 'utf8'));
    if (!data.qrUsage) return null;
    return { ...data.qrUsage, collectedAt: data.collectedAt };
  } catch { return null; }
}
