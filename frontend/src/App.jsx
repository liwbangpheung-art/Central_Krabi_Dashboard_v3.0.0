import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Workspace from './components/Workspace.jsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false }
  }
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="app-shell">
        <Workspace />
      </div>
    </QueryClientProvider>
  )
}
