"use client";

import { useState } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "@/context/Web3Context";
import styles from "./CreateTreasuryWidget.module.css";

interface CreateTreasuryWidgetProps {
  onCreated?: (vaultAddress: string, tokenAddress: string, treasuryId: string) => void;
}

interface FormData {
  treasuryName: string;
  tokenName: string;
  tokenSymbol: string;
}

interface ValidationErrors {
  treasuryName?: string;
  tokenName?: string;
  tokenSymbol?: string;
  joinTokenAddress?: string;
}

const DEFAULT_USDC_ADDRESSES: Record<string, string> = {
  "1": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // Mainnet USDC
  "11155111": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Sepolia USDC
  "424242": "0x0000000000000000000000000000000000000000" // Arc Testnet dummy
};

export default function CreateTreasuryWidget({ onCreated }: CreateTreasuryWidgetProps) {
  const { provider, signer, address, switchNetwork } = useWeb3();
  const [step, setStep] = useState<"form" | "deploying" | "success">("form");
  const [formData, setFormData] = useState<FormData>({
    treasuryName: "",
    tokenName: "",
    tokenSymbol: "",
    treasuryNetworkId: "11155111", // Default to Sepolia
    joinTokenAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Default USDC on Sepolia
    aiNetwork: "0G Compute (Decentralized)",
    aiModel: "0g-llama-3"
  });
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [deployStatus, setDeployStatus] = useState("");
  const [deployedAddresses, setDeployedAddresses] = useState<{
    token: string;
    vault: string;
    treasuryId: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    setFormData((prev) => {
      const newData = { ...prev, [name]: value };
      
      // Auto-update default USDC if network changes and joinTokenAddress wasn't manually edited
      if (name === "treasuryNetworkId") {
        newData.joinTokenAddress = DEFAULT_USDC_ADDRESSES[value] || "";
      }
      return newData;
    });

    if (validationErrors[name as keyof ValidationErrors]) {
      setValidationErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const validateForm = (): boolean => {
    const errors: ValidationErrors = {};

    if (!formData.treasuryName.trim()) {
      errors.treasuryName = "Treasury name is required";
    } else if (formData.treasuryName.trim().length < 3) {
      errors.treasuryName = "Treasury name must be at least 3 characters";
    } else if (formData.treasuryName.trim().length > 100) {
      errors.treasuryName = "Treasury name must be less than 100 characters";
    }

    if (!formData.tokenName.trim()) {
      errors.tokenName = "Token name is required";
    } else if (formData.tokenName.trim().length < 3) {
      errors.tokenName = "Token name must be at least 3 characters";
    } else if (formData.tokenName.trim().length > 100) {
      errors.tokenName = "Token name must be less than 100 characters";
    }

    if (!formData.tokenSymbol.trim()) {
      errors.tokenSymbol = "Token symbol is required";
    } else if (formData.tokenSymbol.trim().length < 1) {
      errors.tokenSymbol = "Token symbol must be at least 1 character";
    } else if (formData.tokenSymbol.trim().length > 20) {
      errors.tokenSymbol = "Token symbol must be less than 20 characters";
    } else if (!/^[A-Z0-9]+$/.test(formData.tokenSymbol.trim())) {
      errors.tokenSymbol = "Token symbol must contain only uppercase letters and numbers";
    }

    if (!formData.joinTokenAddress?.trim()) {
      errors.joinTokenAddress = "Join Token address is required";
    } else if (!/^0x[a-fA-F0-9]{40}$/.test(formData.joinTokenAddress.trim())) {
      errors.joinTokenAddress = "Must be a valid EVM address";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleDeploy = async () => {
    if (!signer || !address) {
      setError("Wallet not connected");
      return;
    }

    try {
      const network = await provider?.getNetwork();
      let targetChainId = parseInt(formData.treasuryNetworkId);
      
      if (network && Number(network.chainId) !== targetChainId) {
        setDeployStatus("Switching network in MetaMask...");
        await switchNetwork(targetChainId);
        // Wait briefly to allow wallet state to sync
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    } catch (err: any) {
      setError(err.message || `Please switch your wallet to the selected network to deploy.`);
      return;
    }

    if (!validateForm()) {
      return;
    }

    setError(null);
    setStep("deploying");

    try {
      setDeployStatus("Fetching contract artifacts from backend…");

      const [tokenArtifactRes, vaultArtifactRes] = await Promise.all([
        fetch("/api/contracts/artifacts?name=TreasuryToken"),
        fetch("/api/contracts/artifacts?name=TreasuryVault"),
      ]);

      if (!tokenArtifactRes.ok || !vaultArtifactRes.ok) {
        const tokenError = await tokenArtifactRes.text();
        const vaultError = await vaultArtifactRes.text();
        throw new Error(`Artifact fetch failed: ${tokenError || vaultError}`);
      }

      const tokenArtifact = await tokenArtifactRes.json();
      const vaultArtifact = await vaultArtifactRes.json();

      setDeployStatus("Deploying TreasuryToken contract…");
      const tokenFactory = new ethers.ContractFactory(
        tokenArtifact.abi,
        tokenArtifact.bytecode,
        signer
      );

      const tokenContract = await tokenFactory.deploy(
        formData.tokenName.trim(),
        formData.tokenSymbol.trim(),
        address
      );
      await tokenContract.waitForDeployment();
      const tokenAddress = await tokenContract.getAddress();

      setDeployStatus("Deploying TreasuryVault contract…");
      const vaultFactory = new ethers.ContractFactory(
        vaultArtifact.abi,
        vaultArtifact.bytecode,
        signer
      );

      const vaultContract = await vaultFactory.deploy(
        formData.treasuryName.trim(),
        tokenAddress,
        `${formData.treasuryName.trim()} Vault`,
        `${formData.tokenSymbol.trim()}V`
      );
      await vaultContract.waitForDeployment();
      const vaultAddress = await vaultContract.getAddress();

      setDeployStatus("Linking TreasuryToken and TreasuryVault…");
      const linkTx = await tokenContract.setVault(vaultAddress);
      await linkTx.wait();

      if (formData.joinTokenAddress?.trim()) {
        setDeployStatus("Approving Join Token…");
        const approveTx = await vaultContract.newToken(formData.joinTokenAddress.trim());
        await approveTx.wait();
      }

      setDeployStatus("Saving treasury to database…");
      const response = await fetch("/api/treasury/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.treasuryName.trim(),
          tokenName: formData.tokenName.trim(),
          tokenSymbol: formData.tokenSymbol.trim(),
          vaultAddress,
          tokenAddress,
          baseAssetAddress: formData.joinTokenAddress?.trim() || null,
          ownerAddress: address,
          networkName: formData.treasuryNetworkId === "1" ? "Ethereum Mainnet" : formData.treasuryNetworkId === "11155111" ? "Sepolia Testnet" : "Arc Testnet",
          chainId: parseInt(formData.treasuryNetworkId),
          aiNetwork: formData.aiNetwork,
          aiModel: formData.aiModel,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save treasury");
      }

      const result = await response.json();
      const treasuryId = result.treasuryId;

      setDeployedAddresses({ token: tokenAddress, vault: vaultAddress, treasuryId });
      setDeployStatus("Treasury deployed successfully!");
      setStep("success");

      if (onCreated) {
        onCreated(vaultAddress, tokenAddress, treasuryId);
      }
    } catch (err: any) {
      console.error("Deployment error:", err);
      setError(err.message || "Deployment failed.");
      setStep("form");
    }
  };

  const isFormValid = Object.keys(validationErrors).length === 0 && 
    formData.treasuryName.trim() && 
    formData.tokenName.trim() && 
    formData.tokenSymbol.trim();

  return (
    <div className={`glass-card ${styles.widget}`}>
      <h2 className={styles.title}>Create a Treasury</h2>
      <p className={styles.subtitle}>
        Deploy a new smart treasury with its own governance token and vault contract.
      </p>

      {step === "form" && (
        <div className={styles.form}>
          <div className={styles.field}>
            <label className="label" htmlFor="treasuryName">Treasury Name *</label>
            <input
              className={`input ${validationErrors.treasuryName ? "input-error" : ""}`}
              id="treasuryName"
              name="treasuryName"
              placeholder="e.g. Alpha Growth Fund"
              value={formData.treasuryName}
              onChange={handleChange}
            />
            {validationErrors.treasuryName && (
              <span className="error-message">{validationErrors.treasuryName}</span>
            )}
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className="label" htmlFor="tokenName">Treasury Token Name *</label>
              <input
                className={`input ${validationErrors.tokenName ? "input-error" : ""}`}
                id="tokenName"
                name="tokenName"
                placeholder="e.g. Alpha Treasury Token"
                value={formData.tokenName}
                onChange={handleChange}
              />
              {validationErrors.tokenName && (
                <span className="error-message">{validationErrors.tokenName}</span>
              )}
            </div>
            <div className={styles.field}>
              <label className="label" htmlFor="tokenSymbol">Token Symbol *</label>
              <input
                className={`input ${validationErrors.tokenSymbol ? "input-error" : ""}`}
                id="tokenSymbol"
                name="tokenSymbol"
                placeholder="e.g. ALPHA"
                value={formData.tokenSymbol}
                onChange={handleChange}
              />
              {validationErrors.tokenSymbol && (
                <span className="error-message">{validationErrors.tokenSymbol}</span>
              )}
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className="label" htmlFor="treasuryNetworkId">Treasury Network *</label>
              <select
                className="input"
                id="treasuryNetworkId"
                name="treasuryNetworkId"
                value={(formData as any).treasuryNetworkId}
                onChange={handleChange}
              >
                <option value="11155111">Sepolia Testnet</option>
                <option value="424242">Arc Testnet</option>
                <option value="1">Ethereum Mainnet</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className="label" htmlFor="joinTokenAddress">Join Token Address (Base Asset) *</label>
              <input
                className={`input ${validationErrors.joinTokenAddress ? "input-error" : ""}`}
                id="joinTokenAddress"
                name="joinTokenAddress"
                placeholder="e.g. 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
                value={(formData as any).joinTokenAddress}
                onChange={handleChange}
              />
              {validationErrors.joinTokenAddress && (
                <span className="error-message">{validationErrors.joinTokenAddress}</span>
              )}
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className="label" htmlFor="aiNetwork">AI Agent Network *</label>
              <select
                className="input"
                id="aiNetwork"
                name="aiNetwork"
                value={(formData as any).aiNetwork}
                onChange={handleChange}
              >
                <option value="0G Compute (Decentralized)">0G Compute (Decentralized)</option>
                <option value="Google Gemini (Centralized)">Google Gemini (Centralized)</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className="label" htmlFor="aiModel">AI Model *</label>
              <select
                className="input"
                id="aiModel"
                name="aiModel"
                value={(formData as any).aiModel}
                onChange={handleChange}
              >
                {(formData as any).aiNetwork.includes("0G") ? (
                  <>
                    <option value="0g-llama-3">0g-llama-3</option>
                    <option value="0g-deepseek-v3">0g-deepseek-v3</option>
                  </>
                ) : (
                  <>
                    <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                    <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {error && (
            <div className="alert alert-danger">
              <span>⚠️ {error}</span>
            </div>
          )}

          <button
            className="btn btn-primary btn-lg"
            style={{ width: "100%", marginTop: 8 }}
            onClick={handleDeploy}
            disabled={!isFormValid || !address}
            id="deploy-treasury-btn"
          >
            {!address ? "Connect Wallet First" : "Deploy Treasury Contracts"}
          </button>
        </div>
      )}

      {step === "deploying" && (
        <div className={styles.deployingState}>
          <div className={styles.deploySpinner} />
          <p className={styles.deployStatus}>{deployStatus}</p>
          <p className={styles.deployHint}>Please confirm the transaction(s) in your wallet.</p>
        </div>
      )}

      {step === "success" && deployedAddresses && (
        <div className={styles.successState}>
          <div className={styles.successIcon}>✅</div>
          <h3>Treasury Deployed!</h3>
          <div className={styles.addressBlock}>
            <div>
              <span className="stat-label">Vault Contract</span>
              <span className={styles.deployedAddress}>{deployedAddresses.vault}</span>
            </div>
            <div>
              <span className="stat-label">Token Contract</span>
              <span className={styles.deployedAddress}>{deployedAddresses.token}</span>
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => {
              setStep("form");
              setFormData({ treasuryName: "", tokenName: "", tokenSymbol: "" });
              setValidationErrors({});
            }}
            id="create-another-btn"
          >
            Create Another Treasury
          </button>
        </div>
      )}
    </div>
  );
}
