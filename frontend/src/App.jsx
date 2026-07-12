import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Workspace from './components/Workspace.jsx'
import SetPassword from './components/SetPassword.jsx'
import { authClient } from './lib/supabase.js'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false }
  }
})

export default function App() {
  const isSetPassword = window.location.pathname === '/set-password' || new URLSearchParams(window.location.search).has('set-password')
  React.useEffect(() => {
    if (!authClient) return
    authClient.auth.getSession().then(({ data }) => {
      if (data?.session?.access_token) localStorage.setItem('ckap_token', data.session.access_token)
    })
    const { data: listener } = authClient.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) localStorage.setItem('ckap_token', session.access_token)
      else localStorage.removeItem('ckap_token')
    })
    return () => listener.subscription.unsubscribe()
  }, [])
  return (
    <QueryClientProvider client={queryClient}>
      <div className="app-shell">
        {isSetPassword ? <SetPassword /> : <Workspace />}
      </div>
    </QueryClientProvider>
  )
}
