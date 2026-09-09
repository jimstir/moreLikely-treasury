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
        // 1. Fetch all active Gemini treasuries from Prisma
        // Based on our schema, aiNetwork might indicate the provider type. We'll map "Gemini (Platform)" to it.
        const managedTreasuries = await prisma.treasury.findMany({
            where: { aiNetwork: { contains: "Gemini" } }
        });
        
        console.log(`[Scheduler] Found ${managedTreasuries.length} managed platform treasuries (Skipping 0G & Private).`);

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
            console.log(`[Scheduler] Processing treasury ${treasury.id} for owner ${treasury.ownerAddress}...`);
            const orchestrator = new Orchestrator(ProviderType.GEMINI_SUBSCRIBER);
            
            // This verifies the on-chain NFT. If expired or transferred, it throws.
            await orchestrator.initializeChecks(treasury.ownerAddress);
            
            // If we reach here, user is a valid active subscriber.
            await orchestrator.runAgentLoop();
        } catch (error: any) {
            console.error(`[Scheduler] Failed to process treasury ${treasury.id}: ${error.message}`);
            // Logic to mark treasury as inactive or notify user goes here
        }
    }
}

// Automatically start if run directly (e.g. `node scheduler.js`)
if (require.main === module) {
    const scheduler = new PlatformScheduler();
    scheduler.start();
}
