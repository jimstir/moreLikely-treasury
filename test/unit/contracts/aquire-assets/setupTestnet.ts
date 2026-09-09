import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline/promises";
import { execSync } from "child_process";
import * as dotenv from "dotenv";

dotenv.config();

const DEPLOYMENTS_FILE = path.join(__dirname, "testnet-deployments.json");
const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"; // Sepolia USDC

// Minimal ERC20 ABI for balances and transfers
const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)"
];

const rl = readline.createInterface({
    input: process.stdin as any,
    output: process.stdout as any
});

async function main() {
    console.log("==========================================");
    console.log("  Live Sepolia Testnet Swap Setup (Test #3)");
    console.log("==========================================\n");

    if (!process.env.SEPOLIA_RPC_URL) {
        console.error("Error: SEPOLIA_RPC_URL is missing in .env");
        process.exit(1);
    }
    const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);

    // Ensure owner key exists
    const ownerPrivKey = process.env.OWNER_PRIVATE_KEY;
    if (!ownerPrivKey) {
        console.error("Error: OWNER_PRIVATE_KEY is missing in .env");
        process.exit(1);
    }
    const ownerWallet = new ethers.Wallet(ownerPrivKey, provider);

    // Load deployments registry
    let deployments: any[] = [];
    if (fs.existsSync(DEPLOYMENTS_FILE)) {
        deployments = JSON.parse(fs.readFileSync(DEPLOYMENTS_FILE, "utf-8"));
    }

    let selectedRun: any = null;

    if (deployments.length > 0) {
        console.log("Previous Testnet Runs:");
        deployments.forEach((d, idx) => {
            console.log(`[${idx}] Run ID: ${d.id} | Date: ${d.timestamp} | Stakeholders: ${d.stakeholders.length}`);
        });
        console.log(`[N] Start a New Test Run\n`);
        
        const choice = await rl.question("Choose a run [0, 1, ..., N]: ");
        if (choice.toUpperCase() !== 'N') {
            const idx = parseInt(choice);
            if (!isNaN(idx) && deployments[idx]) {
                selectedRun = deployments[idx];
                console.log(`\n=> Resuming Run ID: ${selectedRun.id}`);
            }
        }
    }

    if (!selectedRun) {
        selectedRun = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            ownerKey: ownerPrivKey,
            stakeholders: [],
            contracts: {} // to be filled during deployment
        };
        deployments.push(selectedRun);
        console.log(`\n=> Created New Run ID: ${selectedRun.id}`);
    }

    // Add new stakeholders
    const addCountStr = await rl.question("\nHow many NEW stakeholder wallets would you like to add to this run? (0 for none): ");
    const addCount = parseInt(addCountStr) || 0;
    
    const newlyAddedWallets: any[] = [];
    if (addCount > 0) {
        for (let i = 0; i < addCount; i++) {
            const newWallet = ethers.Wallet.createRandom().connect(provider);
            selectedRun.stakeholders.push(newWallet.privateKey);
            newlyAddedWallets.push(newWallet);
        }
        console.log(`\n=> Generated ${addCount} new stakeholder wallets.`);
    }

    // Save state
    fs.writeFileSync(DEPLOYMENTS_FILE, JSON.stringify(deployments, null, 2));

    // Wait until funding is sufficient
    let funded = false;
    const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, ownerWallet);

    while (!funded) {
        console.log("\n--- Validating Funds ---");
        const ownerEthBal = await provider.getBalance(ownerWallet.address);
        const ownerUsdcBal = await usdcContract.balanceOf(ownerWallet.address);
        
        console.log(`Owner Address: ${ownerWallet.address}`);
        console.log(`Owner ETH: ${ethers.formatEther(ownerEthBal)}`);
        console.log(`Owner USDC: ${ethers.formatUnits(ownerUsdcBal, 6)}\n`);

        let hasSufficient = true;
        
        // Check new wallets and auto-fund if owner has excess
        if (newlyAddedWallets.length > 0) {
            const requiredEthPerNew = ethers.parseEther("0.02"); // enough for approvals/votes
            const requiredUsdcPerNew = BigInt(1000000); // 1 USDC

            const totalEthNeeded = requiredEthPerNew * BigInt(newlyAddedWallets.length);
            const totalUsdcNeeded = requiredUsdcPerNew * BigInt(newlyAddedWallets.length);

            // Auto-split ETH
            if (ownerEthBal >= totalEthNeeded + ethers.parseEther("0.05")) {
                console.log(`=> Owner has excess ETH. Auto-splitting ${ethers.formatEther(totalEthNeeded)} ETH to new wallets...`);
                for (const w of newlyAddedWallets) {
                    const tx = await ownerWallet.sendTransaction({ to: w.address, value: requiredEthPerNew });
                    await tx.wait(1);
                }
                console.log("=> ETH distribution complete.");
            } else {
                console.error(`=> Owner lacks ETH to auto-split. Need at least ${ethers.formatEther(totalEthNeeded + ethers.parseEther("0.05"))} ETH.`);
                hasSufficient = false;
            }

            // Auto-split USDC
            if (ownerUsdcBal >= totalUsdcNeeded) {
                console.log(`=> Owner has excess USDC. Auto-splitting ${ethers.formatUnits(totalUsdcNeeded, 6)} USDC to new wallets...`);
                for (const w of newlyAddedWallets) {
                    const tx = await usdcContract.transfer(w.address, requiredUsdcPerNew);
                    await tx.wait(1);
                }
                console.log("=> USDC distribution complete.");
            } else {
                console.error(`=> Owner lacks USDC to auto-split. Need at least ${ethers.formatUnits(totalUsdcNeeded, 6)} USDC.`);
                hasSufficient = false;
            }
        } else if (selectedRun.stakeholders.length === 0) {
             console.error("=> Cannot proceed with 0 stakeholders. You must add at least 1.");
             hasSufficient = false;
        }

        // Verify all stakeholders have funds
        console.log("\n--- Stakeholder Balances ---");
        for (let i = 0; i < selectedRun.stakeholders.length; i++) {
            const shWallet = new ethers.Wallet(selectedRun.stakeholders[i], provider);
            const ethBal = await provider.getBalance(shWallet.address);
            const usdcBal = await usdcContract.balanceOf(shWallet.address);
            console.log(`Stakeholder [${i}]: ${shWallet.address}`);
            console.log(`  ETH: ${ethers.formatEther(ethBal)}`);
            console.log(`  USDC: ${ethers.formatUnits(usdcBal, 6)}`);
            
            if (ethBal < ethers.parseEther("0.005") || usdcBal < BigInt(1000000)) { // at least 1 USDC
                console.error(`  [ERROR] Stakeholder [${i}] has insufficient funds to participate.`);
                hasSufficient = false;
            }
        }

        if (hasSufficient) {
            funded = true;
            console.log("\n=> Funding verified for all actors!");
        } else {
            console.log("\n[!] Funding requirements not met.");
            const answer = await rl.question("Please fund the Owner Wallet via a Sepolia faucet, then type 'R' to retry or 'E' to exit: ");
            if (answer.toUpperCase() === 'E') {
                process.exit(1);
            }
        }
    }

    // Export current run ID to environment for the hardhat test to consume
    process.env.TESTNET_RUN_ID = selectedRun.id;

    console.log("\n=> Starting live testnet execution. (This will take a while due to block confirmations...)");
    rl.close();

    try {
        // Spawn the Hardhat test command and force --network sepolia
        execSync("npx hardhat test test/contracts/aquire-assets/testnetUniswap.test.ts --network sepolia", { stdio: "inherit" });
    } catch (e) {
        console.error("Test execution failed.");
        process.exit(1);
    }
}

main().catch(console.error);
