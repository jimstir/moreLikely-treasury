/**
 * Trust Profile Attribute Engine
 * Computes all 7 on-chain trust attributes defined in the ui-components spec.
 * Called client-side with a connected ethers Provider.
 */
import { ethers } from "ethers";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Severity = "safe" | "warning" | "critical";

export interface AttributeResult {
  id: number;
  title: string;
  severity: Severity;
  score: number; // 0–100 contribution to overall
  detail: string;
  rawValue?: string;
}

export interface TrustProfileResult {
  overallScore: number; // 0–100 weighted average
  attributes: AttributeResult[];
  computedAt: number; // unix timestamp ms
}

export interface TrustProfileOptions {
  vaultAddress: string;
  provider: ethers.Provider;
  swapPolicyAddress?: string | null;
  lendingPolicyAddress?: string | null;
  extraPolicyAddresses?: string[];
}

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const VAULT_ABI = [
  "function tOwner() view returns (address)",
  "function treasToken() view returns (address)",
  "function proposalNum() view returns (uint256)",
  "function votingThres() view returns (uint256)",
  "function closedProposals(uint256) view returns (bool)",
  "function getAuth(address) view returns (bool)",
  "function tokensL() view returns (address[])",
  "function proposalBook(uint256) view returns (address owner, address token, uint256 withdraw, uint256 deposits, address receiver, bool vote, bool close, uint8 request, bool executed)",
];

const TTOKEN_ABI = [
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];

const LENDING_ABI = [
  "function treasuryVault() view returns (address)",
  "function collateralProposalIds(address) view returns (uint256)",
  "function activeTokens(uint256) view returns (address)",
];

const SWAP_ABI = [
  "function treasuryVault() view returns (address)",
  "function tokenProposalIds(address) view returns (uint256)",
];

const GENERIC_POLICY_ABI = ["function treasuryVault() view returns (address)"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sev2score(s: Severity): number {
  return s === "safe" ? 100 : s === "warning" ? 50 : 10;
}

// ─── Attribute 1: Owner Governance Override ───────────────────────────────────

async function attr1_ownerOverride(
  vault: ethers.Contract,
  owner: string,
  total: number
): Promise<AttributeResult> {
  let closeCount = 0;
  const limit = Math.min(total, 50);
  for (let i = 1; i <= limit; i++) {
    try {
      const p = await vault.proposalBook(i);
      // ProposalType.CLOSE === 1
      if (Number(p.request) === 1 && p.owner.toLowerCase() === owner.toLowerCase()) {
        closeCount++;
      }
    } catch { break; }
  }

  const severity: Severity = closeCount === 0 ? "safe" : closeCount <= 2 ? "warning" : "critical";
  return {
    id: 1,
    title: "Owner Governance Override",
    severity,
    score: sev2score(severity),
    detail:
      closeCount === 0
        ? "No owner-initiated CLOSE proposals found. Early policy recall risk is low."
        : `Owner has opened ${closeCount} CLOSE proposal(s), enabling unilateral early recall of policy funds.`,
    rawValue: `${closeCount} CLOSE proposals by owner`,
  };
}

// ─── Attribute 2: Token Add Control ──────────────────────────────────────────

async function attr2_tokenAddControl(
  owner: string,
  tTokenAddress: string,
  votingThres: bigint,
  provider: ethers.Provider
): Promise<AttributeResult> {
  try {
    const tok = new ethers.Contract(tTokenAddress, TTOKEN_ABI, provider);
    const [supply, bal]: [bigint, bigint] = await Promise.all([
      tok.totalSupply(),
      tok.balanceOf(owner),
    ]);

    if (supply === BigInt(0)) {
      return {
        id: 2, title: "Token Add Control", severity: "warning",
        score: sev2score("warning"),
        detail: "No treasury tokens in circulation yet — control metrics unavailable.",
        rawValue: "Supply = 0",
      };
    }

    const ownerBps = (bal * BigInt(10000)) / supply;
    const canPass = ownerBps >= votingThres;
    const severity: Severity = canPass ? "critical" : "safe";
    const ownerPct = (Number(ownerBps) / 100).toFixed(1);
    const threshold = (Number(votingThres) / 100).toFixed(1);

    return {
      id: 2,
      title: "Token Add Control",
      severity,
      score: sev2score(severity),
      detail: canPass
        ? `Owner holds ${ownerPct}% of shares — above the ${threshold}% threshold. The owner can pass ADD_TOKEN proposals unilaterally, changing treasury asset math without broader consent.`
        : `Owner holds ${ownerPct}% of shares, below the ${threshold}% voting threshold. Token additions require broader consensus.`,
      rawValue: `Owner: ${ownerPct}%, Threshold: ${threshold}%`,
    };
  } catch {
    return {
      id: 2, title: "Token Add Control", severity: "warning",
      score: sev2score("warning"),
      detail: "Could not fetch treasury token balances to evaluate ADD_TOKEN control risk.",
    };
  }
}

// ─── Attribute 3: Consensus Quorum Level ─────────────────────────────────────

function attr3_quorum(votingThres: bigint): AttributeResult {
  const pct = Number(votingThres) / 100;
  const severity: Severity = pct >= 66 ? "safe" : pct >= 50 ? "warning" : "critical";
  const detail =
    pct >= 66
      ? `Supermajority required (${pct.toFixed(1)}%). High democratic security.`
      : pct >= 50
      ? `Simple majority threshold (${pct.toFixed(1)}%). Moderate centralization risk.`
      : `Low quorum (${pct.toFixed(1)}%). A small coalition can pass major restructuring proposals without broad consensus.`;

  return {
    id: 3, title: "Consensus Quorum Level", severity,
    score: sev2score(severity), detail,
    rawValue: `votingThres = ${pct.toFixed(1)}%`,
  };
}

// ─── Attribute 4: Strategy Rebalancing & Asset Deviation Risk ─────────────────

async function attr4_swapRisk(
  swapAddr: string | null,
  vaultAddress: string,
  provider: ethers.Provider
): Promise<AttributeResult> {
  if (!swapAddr) {
    return {
      id: 4, title: "Strategy Rebalancing & Asset Deviation Risk",
      severity: "safe", score: 100,
      detail: "No AssetSwapPolicy linked. Swap deviation risk is not applicable.",
    };
  }
  try {
    const swap = new ethers.Contract(swapAddr, SWAP_ABI, provider);
    const linked: string = await swap.treasuryVault();
    const delegated = linked.toLowerCase() === vaultAddress.toLowerCase();
    if (!delegated) {
      return {
        id: 4, title: "Strategy Rebalancing & Asset Deviation Risk",
        severity: "critical", score: sev2score("critical"),
        detail: "AssetSwapPolicy does not delegate auth to the TreasuryVault. Access control is fragmented — critical risk.",
        rawValue: "Fragmented auth",
      };
    }

    const latest = await provider.getBlockNumber();
    const swapFullAbi = [...SWAP_ABI, "event SwapExecuted(uint256 indexed proposalId, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)"];
    const swapFull = new ethers.Contract(swapAddr, swapFullAbi, provider);
    const events = await swapFull.queryFilter(swapFull.filters.SwapExecuted(), Math.max(0, latest - 1000), latest);
    const severity: Severity = events.length > 10 ? "warning" : "safe";

    return {
      id: 4, title: "Strategy Rebalancing & Asset Deviation Risk",
      severity, score: sev2score(severity),
      detail: events.length > 10
        ? `${events.length} swaps detected in the last 1000 blocks. Review swap history for alignment with treasury goals.`
        : `${events.length} recent swaps. Activity appears within a normal range.`,
      rawValue: `${events.length} recent SwapExecuted events`,
    };
  } catch {
    return {
      id: 4, title: "Strategy Rebalancing & Asset Deviation Risk",
      severity: "warning", score: sev2score("warning"),
      detail: "Could not query the swap policy contract. Verify the policy address is correct.",
    };
  }
}

// ─── Attribute 5: Lending Policy Default-Risk Management ──────────────────────

async function attr5_lendingRisk(
  lendingAddr: string | null,
  vaultAddress: string,
  provider: ethers.Provider
): Promise<AttributeResult> {
  if (!lendingAddr) {
    return {
      id: 5, title: "Lending Policy Default-Risk Management",
      severity: "safe", score: 100,
      detail: "No LendingPolicy is attached to this treasury.",
    };
  }
  try {
    const lending = new ethers.Contract(lendingAddr, LENDING_ABI, provider);
    const linked: string = await lending.treasuryVault();
    const delegated = linked.toLowerCase() === vaultAddress.toLowerCase();

    if (!delegated) {
      return {
        id: 5, title: "Lending Policy Default-Risk Management",
        severity: "critical", score: sev2score("critical"),
        detail: "LendingPolicy does not delegate authorization to the TreasuryVault. Fragmented access control increases default exposure.",
        rawValue: "Fragmented auth",
      };
    }

    // Without a specific AI agent address we cannot confirm AI monitoring
    return {
      id: 5, title: "Lending Policy Default-Risk Management",
      severity: "warning", score: sev2score("warning"),
      detail: "LendingPolicy is linked to the vault (delegated auth ✓), but no AI Governor is confirmed for automatic liquidation monitoring. Configure your AI Governor in the Deploy tab to improve this score.",
      rawValue: "Delegated auth ✓ | AI Governor: unconfirmed",
    };
  } catch {
    return {
      id: 5, title: "Lending Policy Default-Risk Management",
      severity: "warning", score: sev2score("warning"),
      detail: "Could not query the lending policy contract.",
    };
  }
}

// ─── Attribute 6: Unified Policy Access Control ───────────────────────────────

async function attr6_policyAuth(
  policies: string[],
  vaultAddress: string,
  provider: ethers.Provider
): Promise<AttributeResult> {
  if (policies.length === 0) {
    return {
      id: 6, title: "Unified Policy Access Control",
      severity: "safe", score: 100,
      detail: "No external policies linked. Access control is centralized in the vault.",
    };
  }

  let fragmented = 0;
  for (const addr of policies) {
    try {
      const p = new ethers.Contract(addr, GENERIC_POLICY_ABI, provider);
      const linked: string = await p.treasuryVault();
      if (linked.toLowerCase() !== vaultAddress.toLowerCase()) fragmented++;
    } catch {
      fragmented++;
    }
  }

  const severity: Severity =
    fragmented === 0 ? "safe" : fragmented < policies.length ? "warning" : "critical";

  return {
    id: 6, title: "Unified Policy Access Control",
    severity, score: sev2score(severity),
    detail:
      fragmented === 0
        ? `All ${policies.length} linked policies delegate authorization to the vault. Ownership changes propagate instantly.`
        : `${fragmented}/${policies.length} policies use fragmented local access control. Updating the vault owner may not update all policies.`,
    rawValue: `${policies.length - fragmented}/${policies.length} delegated`,
  };
}

// ─── Attribute 7: Unapproved Token & Collateral Additions ─────────────────────

async function attr7_unapprovedTokens(
  lendingAddr: string | null,
  swapAddr: string | null,
  vault: ethers.Contract,
  provider: ethers.Provider
): Promise<AttributeResult> {
  const orphans: string[] = [];

  const scanPolicy = async (
    getProposalId: (token: string) => Promise<bigint>,
    tokens: string[]
  ) => {
    for (const token of tokens) {
      try {
        const pid = await getProposalId(token);
        if (pid === BigInt(0)) continue;
        const p = await vault.proposalBook(pid);
        const closed = await vault.closedProposals(pid);
        if (closed && !p.executed) {
          orphans.push(`${token.slice(0, 6)}…(proposal #${pid})`);
        }
      } catch { /* skip */ }
    }
  };

  if (lendingAddr) {
    try {
      const lending = new ethers.Contract(lendingAddr, LENDING_ABI, provider);
      const tokens: string[] = [];
      for (let i = 0; i < 20; i++) {
        try { tokens.push(await lending.activeTokens(i)); } catch { break; }
      }
      await scanPolicy((t) => lending.collateralProposalIds(t), tokens);
    } catch { /* skip */ }
  }

  if (swapAddr) {
    try {
      const swap = new ethers.Contract(swapAddr, SWAP_ABI, provider);
      const tokenList: string[] = await vault.tokensL();
      await scanPolicy((t) => swap.tokenProposalIds(t), tokenList);
    } catch { /* skip */ }
  }

  const severity: Severity = orphans.length > 0 ? "critical" : "safe";

  return {
    id: 7, title: "Unapproved Token & Collateral Additions",
    severity, score: sev2score(severity),
    detail:
      orphans.length > 0
        ? `Orphaned tokens detected: ${orphans.join(", ")}. These assets are approved on-contract but their associated proposals were rejected or never passed. The owner may be introducing assets without shareholder approval.`
        : "No orphaned tokens detected. All collateral and swap assets are linked to approved or pending proposals.",
    rawValue: `${orphans.length} orphaned token(s)`,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function computeTrustProfile(opts: TrustProfileOptions): Promise<TrustProfileResult> {
  const { vaultAddress, provider, swapPolicyAddress = null, lendingPolicyAddress = null, extraPolicyAddresses = [] } = opts;

  const vault = new ethers.Contract(vaultAddress, VAULT_ABI, provider);

  const [owner, tTokenAddress, proposalNumBig, votingThres]: [string, string, bigint, bigint] =
    await Promise.all([vault.tOwner(), vault.treasToken(), vault.proposalNum(), vault.votingThres()]);

  const totalProposals = Number(proposalNumBig);
  const allPolicies = [
    ...(swapPolicyAddress ? [swapPolicyAddress] : []),
    ...(lendingPolicyAddress ? [lendingPolicyAddress] : []),
    ...extraPolicyAddresses,
  ];

  const attributes = await Promise.all([
    attr1_ownerOverride(vault, owner, totalProposals),
    attr2_tokenAddControl(owner, tTokenAddress, votingThres, provider),
    Promise.resolve(attr3_quorum(votingThres)),
    attr4_swapRisk(swapPolicyAddress, vaultAddress, provider),
    attr5_lendingRisk(lendingPolicyAddress, vaultAddress, provider),
    attr6_policyAuth(allPolicies, vaultAddress, provider),
    attr7_unapprovedTokens(lendingPolicyAddress, swapPolicyAddress, vault, provider),
  ]);

  const overallScore = Math.round(attributes.reduce((s, a) => s + a.score, 0) / attributes.length);

  return { overallScore, attributes, computedAt: Date.now() };
}
