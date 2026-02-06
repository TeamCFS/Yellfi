import { useAccount, useConnect, useDisconnect, useSwitchChain, useChainId } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { sepolia } from 'wagmi/chains';
import { CONTRACTS } from '@/config/contracts';

export function useWallet() {
  const { address, isConnected, isConnecting } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const chainId = useChainId();

  const isWrongNetwork = isConnected && chainId !== CONTRACTS.chainId;

  const connectWallet = () => {
    connect({ connector: injected() });
  };

  const switchToSepolia = async () => {
    try {
      await switchChain({ chainId: sepolia.id });
    } catch (error) {
      console.error('Failed to switch network:', error);
    }
  };

  return {
    address,
    isConnected,
    isConnecting,
    connect: connectWallet,
    disconnect,
    chainId,
    isWrongNetwork,
    isSwitching,
    switchToSepolia,
    expectedChainId: CONTRACTS.chainId,
    expectedChainName: CONTRACTS.chainName,
  };
}
