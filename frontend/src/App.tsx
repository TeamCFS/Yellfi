import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { Dashboard, DeployWizard, StrategyEditor, ExecutionMonitor, AgentDetail } from '@/pages';
import { BrandButton, YellowNetworkBadge } from '@/components';
import { cn, shortenAddress } from '@/lib/utils';
import { wagmiConfig } from '@/config';
import { useWallet } from '@/hooks';

const queryClient = new QueryClient();

function WalletButton() {
  const { 
    address, 
    isConnected, 
    isConnecting, 
    connect, 
    disconnect,
    isWrongNetwork,
    isSwitching,
    switchToSepolia,
    expectedChainName,
  } = useWallet();

  if (isConnected && isWrongNetwork) {
    return (
      <BrandButton 
        variant="outline" 
        size="sm" 
        onClick={switchToSepolia} 
        loading={isSwitching}
        className="border-red-500 text-red-400 hover:bg-red-500/10"
      >
        Switch to {expectedChainName}
      </BrandButton>
    );
  }

  if (isConnected && address) {
    return (
      <BrandButton variant="outline" size="sm" onClick={() => disconnect()}>
        {shortenAddress(address)}
      </BrandButton>
    );
  }

  return (
    <BrandButton variant="outline" size="sm" onClick={connect} loading={isConnecting}>
      Connect Wallet
    </BrandButton>
  );
}

function NetworkWarningBanner() {
  const { isConnected, isWrongNetwork, isSwitching, switchToSepolia, expectedChainName } = useWallet();

  if (!isConnected || !isWrongNetwork) {
    return null;
  }

  return (
    <div className="bg-red-500/20 border-b border-red-500/50 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2 text-red-400">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-sm font-medium">
            Wrong network detected. Please switch to {expectedChainName} to use YellFi.
          </span>
        </div>
        <button
          onClick={switchToSepolia}
          disabled={isSwitching}
          className="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {isSwitching ? 'Switching...' : `Switch to ${expectedChainName}`}
        </button>
      </div>
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { path: '/deploy', label: 'Deploy', icon: 'M12 4v16m8-8H4' },
    { path: '/executions', label: 'Monitor', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  ];

  return (
    <div className="min-h-screen bg-yellfi-dark-primary">
      {/* Background gradient */}
      <div className="fixed inset-0 bg-gradient-hero pointer-events-none" />

      {/* Network Warning Banner */}
      <NetworkWarningBanner />

      {/* Header */}
      <header className="sticky top-0 z-50 glass-strong border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3">
              <img src="/logo.png" alt="YellFi" className="w-10 h-10" />
              <span className="text-xl font-bold text-gradient">YellFi</span>
            </Link>

            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    location.pathname === item.path
                      ? 'bg-yellfi-yellow-500/10 text-yellfi-yellow-400'
                      : 'text-neutral-400 hover:text-white hover:bg-white/5'
                  )}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                  </svg>
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* Yellow Network Status */}
            <YellowNetworkBadge />

            {/* Connect Wallet */}
            <WalletButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <span>Powered by</span>
              <span className="text-yellfi-yellow-400">Uniswap v4</span>
              <span>+</span>
              <span className="text-yellfi-blue-400">Yellow SDK</span>
              <span>+</span>
              <span className="text-yellfi-cyan-400">ENS</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-neutral-500">
              <span>Sepolia Testnet</span>
              <a
                href="https://github.com/TeamCFS/Yellfi"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/deploy" element={<DeployWizard />} />
              <Route path="/agent/:agentId" element={<AgentDetail />} />
              <Route path="/agent/:agentId/edit" element={<StrategyEditor />} />
              <Route path="/executions" element={<ExecutionMonitor />} />
            </Routes>
          </Layout>
          <Toaster 
            position="bottom-right"
            toastOptions={{
              style: {
                background: '#1a1a2e',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff',
              },
            }}
          />
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
