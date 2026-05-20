/**
 * Notification click routing for the renderer process.
 *
 * Listens for `coaching:notification-clicked` IPC events from the main process
 * and navigates to the target page via React Router.
 */

type NavigateFn = (path: string) => void

const PAGE_ROUTES: Record<string, string> = {
  'diet-log': '/diet-log',
  chat: '/chat',
  home: '/',
}

/**
 * Start listening for notification click events and route to the appropriate page.
 * Should be called inside a React component that has access to `useNavigate()`.
 *
 * Returns a cleanup function that removes the listener.
 */
export function startNotificationClickListener(navigate: NavigateFn): () => void {
  if (typeof window === 'undefined' || !window.coaching?.onNotificationClicked) {
    return () => {}
  }

  const unsubscribe = window.coaching.onNotificationClicked((page: string) => {
    const route = PAGE_ROUTES[page] ?? '/'
    navigate(route)
  })

  return unsubscribe
}
