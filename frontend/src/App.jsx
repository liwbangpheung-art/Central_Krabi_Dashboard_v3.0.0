import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Workspace from './components/Workspace'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Central Krabi Analytics Platform</h1>
          <p className="text-sm text-gray-500">v3.0.0 • Workspace Hybrid</p>
        </header>
        <Workspace />
      </div>
    </QueryClientProvider>
  )
}

export default App
