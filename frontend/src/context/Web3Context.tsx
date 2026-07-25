"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { ethers } from "ethers";
import { getTreasuryVault } from "@/lib/contracts";

// ─── Types ───
interface Web3State {
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;
  address: string | null;
  chainId: number | null;
  isOwner: boolean;
  isStakeholder: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const defaultState: Web3State = {
  provider: null,
  signer: null,
  address: null,
  chainId: null,
  isOwner: false,
  isStakeholder: false,
  isConnected: false,
  isConnecting: false,
  error: null,
  connect: async () => {},
  disconnect: () => {},
};

const Web3Context = createContext<Web3State>(defaultState);

export function useWeb3() {
  return useContext(Web3Context);
}

// ─── Supported Networks ───
const SUPPORTED_CHAINS: Record<number, string> = {
  1: "Ethereum Mainnet",
  11155111: "Sepolia Testnet",
  31337: "Hardhat Local",
};

// ─── Provider Component ───
interface Web3ProviderProps {
  children: ReactNode;
  treasuryVaultAddress?: string;
}

export function Web3Provider({ children, treasuryVaultAddress }: Web3ProviderProps) {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isStakeholder, setIsStakeholder] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check user role against TreasuryVault
  const checkRole = useCallback(
    async (provider: ethers.BrowserProvider, userAddress: string) => {
      if (!treasuryVaultAddress) return;
      try {
        const vault = getTreasuryVault(treasuryVaultAddress, provider);
        const owner = await vault.WhosOwner();
        setIsOwner(owner.toLowerCase() === userAddress.toLowerCase());

        // Check if user has TreasuryToken balance (indicates stakeholder)
        // This is a simplified check; in production, query the TreasuryToken directly
        setIsStakeholder(true); // Placeholder until token check is implemented
      } catch (err) {
        console.warn("Could not check treasury role:", err);
      }
    },
    [treasuryVaultAddress]
  );

  const syncWalletState = useCallback(
    async (browserProvider: ethers.BrowserProvider, userAddress: string, currentChainId: number) => {
      const userSigner = await browserProvider.getSigner();
      setProvider(browserProvider);
      setSigner(userSigner);
      setChainId(currentChainId);
      setAddress(userAddress.toLowerCase());
      await checkRole(browserProvider, userAddress);
    },
    [checkRole]
  );

  const ensureSupportedNetwork = useCallback(async (ethereum: any, currentChainId: number) => {
    if (SUPPORTED_CHAINS[currentChainId]) {
      return currentChainId;
    }

    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xaa36a7" }], // Sepolia
    });

    const updatedProvider = new ethers.BrowserProvider(ethereum);
    const updatedNetwork = await updatedProvider.getNetwork();
    return Number(updatedNetwork.chainId);
  }, []);

  // Connect wallet via MetaMask / injected provider
  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      if (typeof window === "undefined" || !(window as any).ethereum) {
        throw new Error("No wallet detected. Please install MetaMask.");
      }

      const ethereum = (window as any).ethereum;

      // Request account access - this prompts the user
      await ethereum.request({ method: "eth_requestAccounts" });

      const browserProvider = new ethers.BrowserProvider(ethereum);
      const userSigner = await browserProvider.getSigner();
      const userAddress = await userSigner.getAddress();
      const network = await browserProvider.getNetwork();
      let currentChainId = Number(network.chainId);

      try {
        currentChainId = await ensureSupportedNetwork(ethereum, currentChainId);
      } catch {
        setError(`Unsupported network (chainId: ${currentChainId}). Please switch to Sepolia or Hardhat.`);
        return;
      }

      const activeProvider = new ethers.BrowserProvider(ethereum);
      await syncWalletState(activeProvider, userAddress, currentChainId);
    } catch (err: any) {
      setError(err.message || "Failed to connect wallet.");
    } finally {
      setIsConnecting(false);
    }
  }, [ensureSupportedNetwork, syncWalletState]);

  // Restore session if MetaMask already has an approved account
  useEffect(() => {
    const reconnect = async () => {
      if (typeof window === "undefined" || !(window as any).ethereum) return;

      const ethereum = (window as any).ethereum;
      try {
        const accounts: string[] = await ethereum.request({ method: "eth_accounts" });
        if (accounts.length === 0) return;

        const browserProvider = new ethers.BrowserProvider(ethereum);
        const network = await browserProvider.getNetwork();
        const currentChainId = Number(network.chainId);
        const userAddress = accounts[0];

        await syncWalletState(browserProvider, userAddress, currentChainId);
      } catch (err) {
        console.warn("Could not restore wallet session:", err);
      }
    };

    reconnect();
  }, [syncWalletState]);

  // Disconnect
  const disconnect = useCallback(() => {
    setProvider(null);
    setSigner(null);
    setAddress(null);
    setChainId(null);
    setIsOwner(false);
    setIsStakeholder(false);
    setError(null);
  }, []);

  // Listen for account and chain changes
  useEffect(() => {
    if (typeof window === "undefined" || !(window as any).ethereum) return;
    const ethereum = (window as any).ethereum;

    const handleAccountsChanged = async (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect();
        return;
      }

      try {
        const browserProvider = new ethers.BrowserProvider(ethereum);
        const network = await browserProvider.getNetwork();
        await syncWalletState(browserProvider, accounts[0], Number(network.chainId));
      } catch (err) {
        console.warn("Could not update wallet account:", err);
        setAddress(accounts[0].toLowerCase());
      }
    };

    const handleChainChanged = async (chainIdHex: string) => {
      const newChainId = parseInt(chainIdHex, 16);
      setChainId(newChainId);

      try {
        const browserProvider = new ethers.BrowserProvider(ethereum);
        const accounts: string[] = await ethereum.request({ method: "eth_accounts" });
        if (accounts.length > 0) {
          await syncWalletState(browserProvider, accounts[0], newChainId);
        }
      } catch (err) {
        console.warn("Could not refresh wallet after chain change:", err);
      }
    };

    ethereum.on("accountsChanged", handleAccountsChanged);
    ethereum.on("chainChanged", handleChainChanged);

    return () => {
      ethereum.removeListener("accountsChanged", handleAccountsChanged);
      ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, [disconnect, syncWalletState]);

  const value: Web3State = {
    provider,
    signer,
    address,
    chainId,
    isOwner,
    isStakeholder,
    isConnected: !!address,
    isConnecting,
    error,
    connect,
    disconnect,
  };

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}
