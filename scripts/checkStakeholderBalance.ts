import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
    // Read the logged vault address from the inputs file
    const inputsPath = path.join("test", "inputs", "voting_inputs.txt");
    if (!fs.existsSync(inputsPath)) {
        console.error("Test input file not found. Make sure tests were executed first.");
        return;
    }

    const inputsContent = fs.readFileSync(inputsPath, "utf8");
    const vaultLine = inputsContent.split("\n").find(line => line.includes("TreasuryVault:"));
    const vaultAddress = vaultLine ? vaultLine.split(" ")[1].trim() : "";

    if (!vaultAddress) {
        console.error("Vault address could not be recovered from test logs.");
        return;
    }

    // Connect to contracts
    const vault = await ethers.getContractAt("TreasuryVault", vaultAddress);
    const tokenAddress = await vault.asset();
    const token = await ethers.getContractAt("TreasuryToken", tokenAddress);

    // Query balance of Stakeholder 10
    const stakeholder10 = "0xBcd4042DE499D14e55001CcbB24a551F3b954096";
    const balance = await token.balanceOf(stakeholder10);
    const vaultShares = await vault.userDeposit(stakeholder10, 1);

    console.log("\n==================================================");
    console.log("LIVE BLOCKCHAIN STATE (STAKEHOLDER 10)");
    console.log(`Address: ${stakeholder10}`);
    console.log(`TreasuryToken Balance (Voting Weight): ${ethers.formatEther(balance)} TRES`);
    console.log(`Vault Proposal Shares (Voted Weight): ${ethers.formatEther(vaultShares)} VSHARE`);
    console.log("==================================================\n");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
