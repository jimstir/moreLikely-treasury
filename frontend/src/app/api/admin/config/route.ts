import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
    try {
        let config = await prisma.platformConfig.findFirst();
        if (!config) {
            config = await prisma.platformConfig.create({
                data: { cronIntervalMs: 3600000, maxConcurrentJobs: 10, isPaused: false }
            });
        }
        return NextResponse.json(config);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        // Mocking the NextAuth session check
        // In a real app, use `await getServerSession()` to verify ADMIN role
        const body = await req.json();
        const { cronIntervalMs, maxConcurrentJobs, isPaused } = body;

        let config = await prisma.platformConfig.findFirst();
        if (!config) {
            config = await prisma.platformConfig.create({
                data: { cronIntervalMs: Number(cronIntervalMs), maxConcurrentJobs: Number(maxConcurrentJobs), isPaused: Boolean(isPaused) }
            });
        } else {
            config = await prisma.platformConfig.update({
                where: { id: config.id },
                data: { cronIntervalMs: Number(cronIntervalMs), maxConcurrentJobs: Number(maxConcurrentJobs), isPaused: Boolean(isPaused) }
            });
        }

        return NextResponse.json(config);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
