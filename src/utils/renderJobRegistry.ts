/**
 * Shared render-job cancellation registry — single source of truth used by
 * both render engines (clientRender.ts's FFmpeg pipeline and
 * webCodecsRender.ts), so RenderButton.tsx's cancel button works no matter
 * which engine actually ended up running the job.
 */
const activeJobs = new Map<string, { cancelled: boolean }>();

export function registerJob(jobId: string) {
  activeJobs.set(jobId, { cancelled: false });
}

export function isJobCancelled(jobId: string): boolean {
  return activeJobs.get(jobId)?.cancelled ?? false;
}

export function cancelRenderJob(jobId: string) {
  const job = activeJobs.get(jobId);
  if (job) job.cancelled = true;
}

export function unregisterJob(jobId: string) {
  activeJobs.delete(jobId);
}
