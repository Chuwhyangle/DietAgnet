import { planningDb, type CoachingAuditEntry } from '../stores/planning'

/**
 * Persist a new audit entry with the current ISO timestamp.
 */
export async function writeAuditEntry(
  entry: Omit<CoachingAuditEntry, 'id' | 'timestamp'>,
): Promise<CoachingAuditEntry> {
  const record: CoachingAuditEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  }

  const id = await planningDb.coachingAuditLog.add(record)
  return { ...record, id }
}

/**
 * Return recent audit entries ordered by timestamp descending.
 * Defaults to 50 entries when no limit is provided.
 */
export async function getRecentAuditEntries(limit = 50): Promise<CoachingAuditEntry[]> {
  const safeLimit = Math.max(1, limit)
  const entries = await planningDb.coachingAuditLog
    .orderBy('timestamp')
    .reverse()
    .limit(safeLimit)
    .toArray()

  return entries
}
