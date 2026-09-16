import { PrismaClient } from '@prisma/client';
import { Orchestrator, ProviderType } from "./orchestrator";

const prisma = new PrismaClient();

export class PlatformScheduler {
    private isRunning: boolean = false;
    private timer: NodeJS.Timeout | null = null;

    public async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log("[Scheduler] Platform Scheduler Daemon started.");
        await this.loop();
    }

    public stop() {
        this.isRunning = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        console.log("[Scheduler] Platform Scheduler Daemon stopped.");
    }

    private async loop() {
        if (!this.isRunning) return;

        try {
            // 1. Fetch Dynamic Limits from DB
            let limits = await prisma.platformConfig.findFirst();
            
            // Fallback if table is empty
            if (!limits) {
                limits = await prisma.platformConfig.create({
                    data: { cronIntervalMs: 3600000, maxConcurrentJobs: 10, isPaused: false }
                });
            }

            if (limits.isPaused) {
                console.log("[Scheduler] System is PAUSED. Skipping execution cycle.");
            } else {
                console.log(`[Scheduler] Cycle starting. Max concurrent jobs: ${limits.maxConcurrentJobs}`);
                await this.executeCycle(limits.maxConcurrentJobs);
            }

            // 2. Schedule next loop
            this.timer = setTimeout(() => this.loop(), limits.cronIntervalMs);
        } catch (error) {
            console.error("[Scheduler] Error in main loop:", error);
            // Fallback retry delay in case of DB failure
            this.timer = setTimeout(() => this.loop(), 60000); 
        }
    }

    private async executeCycle(maxConcurrent: number) {
        // 1. Fetch all platform-managed treasuries (Gemini & 0G)
        // We only skip Private (Local) deployers since they run their own execution environment.
        const managedTreasuries = await prisma.treasury.findMany({
            where: { 
                OR: [
                    { aiNetwork: { contains: "Gemini" } },
                    { aiNetwork: { contains: "0G" } }
                ]
            }
        });
        
        console.log(`[Scheduler] Found ${managedTreasuries.length} managed treasuries (Gemini & 0G). skipping Private.`);

        // 3. Process jobs with concurrency limits
        const activePromises: Promise<void>[] = [];
        
        for (const treasury of managedTreasuries) {
            if (activePromises.length >= maxConcurrent) {
                // Wait for the first promise to finish before queuing more
                await Promise.race(activePromises);
            }

            const job = this.processTreasury(treasury).finally(() => {
                const index = activePromises.indexOf(job);
                if (index > -1) activePromises.splice(index, 1);
            });
            activePromises.push(job);
        }

        // Wait for all remaining jobs in this cycle to finish
        await Promise.all(activePromises);
        console.log("[Scheduler] Execution cycle completed.");
    }

    private async processTreasury(treasury: any): Promise<void> {
        try {
            console.log(`[Scheduler] Processing treasury ${treasury.id} for owner ${treasury.ownerAddress} using ${treasury.aiNetwork}...`);
            
            // Route to correct provider based on user selection
            let providerType = ProviderType.GEMINI_SUBSCRIBER;
            if (treasury.aiNetwork && treasury.aiNetwork.includes("0G")) {
                providerType = ProviderType.ZERO_G;
            }

            const orchestrator = new Orchestrator(providerType);
            
            // This verifies the on-chain NFT (for Gemini) or local configs
            await orchestrator.initializeChecks(treasury.ownerAddress);
            
            // If we reach here, user is valid.
            await orchestrator.runAgentLoop("Analyze treasury state and execute actions based on the mandate if necessary.");
        } catch (error: any) {
            if (error.message.includes("402 Payment Required") || error.message.includes("Insufficient 0G Network balance")) {
                console.warn(`[Scheduler] SKIPPED treasury ${treasury.id}: 0G Wallet Balance empty.`);
            } else {
                console.error(`[Scheduler] Failed to process treasury ${treasury.id}: ${error.message}`);
            }
            // Logic to mark treasury as inactive or notify user goes here
        }
    }
}

// Automatically start if run directly (e.g. `node scheduler.js`)
if (require.main === module) {
    const scheduler = new PlatformScheduler();
    scheduler.start();
}
