import { expect } from "chai";
import { ethers } from "hardhat";
import type { Signer } from "ethers";

describe("Treasury deployment and view functions", function () {
  let owner: Signer;
  let ownerAddress: string;
  let treasuryToken: any;
  let treasuryVault: any;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();

    const TreasuryToken = await ethers.getContractFactory("TreasuryToken");
    treasuryToken = await TreasuryToken.connect(owner).deploy(
      "Treasury Shares",
      "TRES",
      ownerAddress
    );
    await treasuryToken.waitForDeployment();
  });

  it("deploys TreasuryToken and TreasuryVault and links them on-chain", async function () {
    const TreasuryVault = await ethers.getContractFactory("TreasuryVault");
    treasuryVault = await TreasuryVault.connect(owner).deploy(
      "moreLikely Treasury",
      await treasuryToken.getAddress(),
      ownerAddress,
      100,
      "Vault Shares",
      "VSHARE"
    );
    await treasuryVault.waitForDeployment();

    const setVaultTx = await treasuryToken.connect(owner).setVault(await treasuryVault.getAddress());
    await setVaultTx.wait();

    const vaultOwner = await treasuryVault.tOwner();
    const vaultTokenAddress = await treasuryVault.treasToken();
    const treasuryName = await treasuryVault.treasName();
    const tokenVaultAddress = await treasuryToken.vault();

    expect(vaultOwner).to.equal(ownerAddress);
    expect(vaultTokenAddress).to.equal(await treasuryToken.getAddress());
    expect(treasuryName).to.equal("moreLikely Treasury");
    expect(tokenVaultAddress).to.equal(await treasuryVault.getAddress());
  });

  it("returns the connected signer as owner through TreasuryVault view functions", async function () {
    const TreasuryVault = await ethers.getContractFactory("TreasuryVault");
    treasuryVault = await TreasuryVault.connect(owner).deploy(
      "moreLikely Treasury",
      await treasuryToken.getAddress(),
      ownerAddress,
      100,
      "Vault Shares",
      "VSHARE"
    );
    await treasuryVault.waitForDeployment();

    const setVaultTx = await treasuryToken.connect(owner).setVault(await treasuryVault.getAddress());
    await setVaultTx.wait();

    const connectedOwner = await owner.getAddress();
    const onChainOwner = await treasuryVault.tOwner();

    expect(onChainOwner.toLowerCase()).to.equal(connectedOwner.toLowerCase());
    expect(onChainOwner).to.equal(ownerAddress);
  });

  it("calls several TreasuryVault and TreasuryToken view functions and logs the returned values", async function () {
    const TreasuryVault = await ethers.getContractFactory("TreasuryVault");
    treasuryVault = await TreasuryVault.connect(owner).deploy(
      "moreLikely Treasury",
      await treasuryToken.getAddress(),
      ownerAddress,
      100,
      "Vault Shares",
      "VSHARE"
    );
    await treasuryVault.waitForDeployment();

    const setVaultTx = await treasuryToken.connect(owner).setVault(await treasuryVault.getAddress());
    await setVaultTx.wait();

    const vaultOwner = await treasuryVault.tOwner();
    const treasuryName = await treasuryVault.treasName();
    const vaultTokenAddress = await treasuryVault.treasToken();
    const tokenVaultAddress = await treasuryToken.vault();
    const proposalCount = await treasuryVault.proposalNum();
    const tokenApproved = await treasuryVault.approvedTokens(await treasuryToken.getAddress());

    console.log("view: vaultOwner=", vaultOwner);
    console.log("view: treasuryName=", treasuryName);
    console.log("view: vaultTokenAddress=", vaultTokenAddress);
    console.log("view: tokenVaultAddress=", tokenVaultAddress);
    console.log("view: proposalCount=", proposalCount.toString());
    console.log("view: tokenApproved=", tokenApproved);

    expect(vaultOwner).to.equal(ownerAddress);
    expect(treasuryName).to.equal("moreLikely Treasury");
    expect(vaultTokenAddress).to.equal(await treasuryToken.getAddress());
    expect(tokenVaultAddress).to.equal(await treasuryVault.getAddress());
    expect(proposalCount).to.equal(0);
    expect(tokenApproved).to.equal(false);
  });
});
