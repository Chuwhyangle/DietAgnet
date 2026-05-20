import dayjs from 'dayjs'
import { isReminderQuietHours } from '../proactive/rules'
import { getSettings } from '../stores/settings'
import { writeAuditEntry } from './auditLog'
import type { NotifyOptions } from './types'

// ---------------------------------------------------------------------------
// Session-level flag: only emit the "notificationUnsupported" audit entry once
// ---------------------------------------------------------------------------

let unsupportedAuditWritten = false

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine whether OS-level notifications are available.
 * Checks both the Electron bridge method and the response's `supported` flag.
 */
function isNotificationBridgeAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.agent?.showNotification === 'function'
  )
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a desktop (OS-level) notification, respecting quiet hours and
 * falling back to in-app delivery when notifications are unsupported.
 *
 * Returns an object indicating what happened:
 * - `delivered: true` means an OS notification was shown.
 * - `fallbackInApp: true` means the caller should surface an in-app reminder
 *   instead (because notifications are unsupported or quiet hours are active).
 */
export async function sendDesktopNotification(
  options: NotifyOptions,
): Promise<{ delivered: boolean; fallbackInApp: boolean }> {
  const now = dayjs()
  const settings = getSettings()

  // --- Quiet hours check ---
  // During quiet hours we must NOT deliver an OS notification (Req 6.6).
  // The caller may still surface an in-app reminder on next foreground.
  if (isReminderQuietHours(settings.reminders, now)) {
    return { delivered: false, fallbackInApp: false }
  }

  // --- Notification support check ---
  if (!isNotificationBridgeAvailable()) {
    // Write audit entry once per session (Req 6.5)
    if (!unsupportedAuditWritten) {
      unsupportedAuditWritten = true
      await writeAuditEntry({
        actor: 'system',
        action: 'notificationUnsupported',
        payload: {
          reason: 'window.agent.showNotification is not available',
        },
      })
    }
    return { delivered: false, fallbackInApp: true }
  }

  // --- Attempt OS notification delivery ---
  try {
    const response = await window.agent.showNotification({
      title: options.title,
      body: options.body,
      urgency: options.urgency ?? 'normal',
      page: options.page,
    })

    // The bridge reports whether the platform actually supports notifications
    if (!response.supported) {
      if (!unsupportedAuditWritten) {
        unsupportedAuditWritten = true
        await writeAuditEntry({
          actor: 'system',
          action: 'notificationUnsupported',
          payload: {
            reason: response.reason ?? 'Notification.isSupported() returned false',
          },
        })
      }
      return { delivered: false, fallbackInApp: true }
    }

    return { delivered: response.shown, fallbackInApp: !response.shown }
  } catch (error) {
    // If showNotification throws, fall back to in-app (design: error is caught
    // and logged; in-app reminder still displays on next foreground).
    console.error('[DesktopNotifier] showNotification error:', error)
    return { delivered: false, fallbackInApp: true }
  }
}
