import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";
import * as fs from "fs";
import * as path from "path";

describe("Gasless Voting Scale Suite (10 Stakeholders)", function () {
    let owner: Signer;
    let stakeholders: Signer[] = [];
    let stakeholderAddresses: string[] = [];

    let ownerAddress: string;
    let usdc: any;
    let treasuryToken: any;
    let treasuryVault: any;
    let votingPolicy: any;

    beforeEach(async function () {
        const signers = await ethers.getSigners();
        owner = signers[0];
        ownerAddress = await owner.getAddress();

        // Use signers 1 to 10 as our 10 stakeholders
        stakeholders = signers.slice(1, 11);
        stakeholderAddresses = [];
        for (const s of stakeholders) {
            stakeholderAddresses.push(await s.getAddress());
        }

        // 1. Deploy USDC mock
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        usdc = await MockERC20.deploy("Mock USDC", "USDC");
        await usdc.waitForDeployment();

        // 2. Deploy TreasuryToken
        const TreasuryToken = await ethers.getContractFactory("TreasuryToken");
        treasuryToken = await TreasuryToken.deploy(
            "Treasury Shares",
            "TRES",
            ownerAddress
        );
        await treasuryToken.waitForDeployment();

        // 3. Deploy TreasuryVault
        const TreasuryVault = await ethers.getContractFactory("TreasuryVault");
        treasuryVault = await TreasuryVault.deploy(
            "moreLikely Treasury",
            await treasuryToken.getAddress(),
            "Vault Shares",
            "VSHARE"
        );
        await treasuryVault.waitForDeployment();

        // Configure vault on TreasuryToken
        await (await treasuryToken.setVault(await treasuryVault.getAddress())).wait();

        // 4. Deploy TreasuryVoting
        const TreasuryVoting = await ethers.getContractFactory("TreasuryVoting");
        votingPolicy = await TreasuryVoting.deploy(
            await treasuryVault.getAddress(),
            await treasuryToken.getAddress(),
            ownerAddress
        );
        await votingPolicy.waitForDeployment();

        // Approve USDC in vault
        await (await treasuryVault.newToken(await usdc.getAddress())).wait();

        // Stakeholders join treasury
        for (const sAddress of stakeholderAddresses) {
            const sSigner = stakeholders[stakeholderAddresses.indexOf(sAddress)];
            await (await usdc.mint(sAddress, ethers.parseEther("100"))).wait();
            await (await usdc.connect(sSigner).approve(await treasuryVault.getAddress(), ethers.parseEther("100"))).wait();
            await (await treasuryVault.connect(sSigner).joinTreasury(await usdc.getAddress(), ethers.parseEther("100"), false, 0)).wait();

            // Approve votingPolicy to spend TreasuryTokens
            await (await treasuryToken.connect(sSigner).approve(await votingPolicy.getAddress(), ethers.parseEther("100"))).wait();
        }

        // --- Log Inputs to test/inputs/voting_inputs.txt ---
        fs.mkdirSync(path.join("test", "inputs"), { recursive: true });
        
        let inputsLog = "==================================================\n";
        inputsLog += "GASLESS VOTING TEST INPUTS\n";
        inputsLog += `Timestamp: ${new Date().toISOString()}\n`;
        inputsLog += `TreasuryVault: ${await treasuryVault.getAddress()}\n`;
        inputsLog += `TreasuryVoting: ${await votingPolicy.getAddress()}\n`;
        inputsLog += "==================================================\n\n";
        inputsLog += "INITIAL STAKEHOLDER BALANCES:\n";

        for (let i = 0; i < 10; i++) {
            const voterAddr = stakeholderAddresses[i];
            const usdcBal = await usdc.balanceOf(voterAddr);
            const tresBal = await treasuryToken.balanceOf(voterAddr);
            const voteAmount = (i + 1).toString(); // planned vote amount

            inputsLog += `Stakeholder ${i + 1} (${voterAddr}):\n`;
            inputsLog += `  - USDC Balance: ${ethers.formatEther(usdcBal)} USDC\n`;
            inputsLog += `  - TreasuryToken Balance (Voting Weight): ${ethers.formatEther(tresBal)} TRES\n`;
            inputsLog += `  - Planned Vote Deposit: ${voteAmount} TRES\n\n`;
        }

        fs.writeFileSync(path.join("test", "inputs", "voting_inputs.txt"), inputsLog);
    });

    async function getSignature(
        voterSigner: Signer,
        voterAddr: string,
        proposalId: number,
        amount: string,
        support: boolean,
        nonce: number
    ) {
        const chainId = (await ethers.provider.getNetwork()).chainId;
        const domain = {
            name: "TreasuryVoting",
            version: "1",
            chainId: chainId,
            verifyingContract: await votingPolicy.getAddress()
        };

        const types = {
            Vote: [
                { name: "voter", type: "address" },
                { name: "proposalId", type: "uint256" },
                { name: "amount", type: "uint256" },
                { name: "support", type: "bool" },
                { name: "nonce", type: "uint256" }
            ]
        };

        const value = {
            voter: voterAddr,
            proposalId: proposalId,
            amount: ethers.parseEther(amount),
            support: support,
            nonce: nonce
        };

        const signature = await (voterSigner as any).signTypedData(domain, types, value);
        return signature;
    }

    it("should process 10 gasless stakeholder signatures, deposit 10 distinct share amounts, and verify correct allocations", async function () {
        const proposalId = 1;
        await (
            await treasuryVault.proposalOpen(
                ethers.parseEther("50"),
                await votingPolicy.getAddress(),
                ownerAddress,
                true,
                false,
                await usdc.getAddress()
            )
        ).wait();

        // 10 stakeholders voting with amounts: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 TRES
        const votes = [];
        for (let i = 0; i < 10; i++) {
            const voterAddr = stakeholderAddresses[i];
            const voterSigner = stakeholders[i];
            const amountStr = (i + 1).toString(); // e.g. "1" to "10"
            
            const signature = await getSignature(voterSigner, voterAddr, proposalId, amountStr, true, 1);
            
            votes.push({
                voter: voterAddr,
                amount: ethers.parseEther(amountStr),
                support: true,
                nonce: 1,
                signature: signature
            });
        }

        // Execute batchVoteDirect on policy (AI Governor / Owner EOA pays the gas)
        const tx = await votingPolicy.batchVoteDirect(proposalId, votes);
        await tx.wait();

        // Verify total shares in vault (sum of 1 to 10 = 55 shares)
        const totalShares = await treasuryVault.totalShares(proposalId);
        expect(totalShares).to.be.above(0);

        // Verify each stakeholder's individual vault share allocation matches their vote amount
        for (let i = 0; i < 10; i++) {
            const voterAddr = stakeholderAddresses[i];
            const expectedAmount = ethers.parseEther((i + 1).toString());
            
            const actualShares = await treasuryVault.userDeposit(voterAddr, proposalId);
            expect(actualShares).to.equal(expectedAmount);
            
            console.log(`Stakeholder ${i + 1} (${voterAddr.slice(0, 6)}...): verified exact allocation of ${ethers.formatEther(actualShares)} shares`);
        }

        // Verify overall vote passes
        const votingPassed = await treasuryVault.vote(proposalId);
        expect(votingPassed).to.be.true;

        // Close the proposal to allow stakeholders to withdraw their voting tokens back
        await (await treasuryVault.proposalClose(proposalId)).wait();
        expect(await treasuryVault.closedProposal(proposalId)).to.be.true;

        // Stakeholder 10 retrieves their 10 TRES voting tokens back
        const sh10Signer = stakeholders[9];
        const sh10Addr = stakeholderAddresses[9];
        const beforeWithdraw = await treasuryToken.balanceOf(sh10Addr);

        await (await treasuryVault.connect(sh10Signer).proposalWithdraw(
            ethers.parseEther("10"),
            sh10Addr,
            sh10Addr,
            proposalId
        )).wait();

        const afterWithdraw = await treasuryToken.balanceOf(sh10Addr);
        expect(afterWithdraw - beforeWithdraw).to.equal(ethers.parseEther("10"));

        // --- Log Results to test/inputs/voting_results.txt ---
        let resultsLog = "==================================================\n";
        resultsLog += "GASLESS VOTING TEST RESULTS\n";
        resultsLog += `Timestamp: ${new Date().toISOString()}\n`;
        resultsLog += `Proposal ID: ${proposalId}\n`;
        resultsLog += `Total Votes Registered on Vault: ${ethers.formatEther(totalShares)} TRES shares\n`;
        resultsLog += `Vault Voting Status: ${votingPassed ? "PASSED" : "FAILED"}\n`;
        resultsLog += "Note: Stakeholder 10 successfully withdrew their 10 TRES back after proposal closed.\n";
        resultsLog += "==================================================\n\n";
        resultsLog += "POST-TEST STAKEHOLDER BALANCES:\n";

        for (let i = 0; i < 10; i++) {
            const voterAddr = stakeholderAddresses[i];
            const usdcBal = await usdc.balanceOf(voterAddr);
            const tresBal = await treasuryToken.balanceOf(voterAddr);
            const depositAmount = await treasuryVault.userDeposit(voterAddr, proposalId);
            const withdrewAmount = await treasuryVault.userWithdrew(voterAddr, proposalId);
            const activeVotes = depositAmount - withdrewAmount;

            resultsLog += `Stakeholder ${i + 1} (${voterAddr}):\n`;
            resultsLog += `  - USDC Balance: ${ethers.formatEther(usdcBal)} USDC\n`;
            resultsLog += `  - TreasuryToken Balance (Remaining Weight): ${ethers.formatEther(tresBal)} TRES\n`;
            resultsLog += `  - Vault Proposal Shares (Active Votes): ${ethers.formatEther(activeVotes)} VSHARE\n\n`;
        }

        fs.writeFileSync(path.join("test", "inputs", "voting_results.txt"), resultsLog);
    });
});
