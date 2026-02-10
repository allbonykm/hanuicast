import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create a Supabase client with the SERVICE_ROLE_KEY for admin privileges (Storage delete)
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export const dynamic = 'force-dynamic'; // Ensure this doesn't get cached

export async function GET(req: Request) {
    try {
        console.log('[Cleanup Cron] Starting storage cleanup job...');

        // 1. Check for Service Role Key
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            console.error('[Cleanup Cron] Missing SUPABASE_SERVICE_ROLE_KEY');
            return NextResponse.json({ error: 'Server misconfiguration: Missing Admin Key' }, { status: 500 });
        }

        // 2. Fetch "Protected" Files (WhiteList) from user_settings
        // We need to get ALL saved papers.
        // Assuming user_settings.savedPapers contains all of them.
        const { data: settingsData, error: settingsError } = await supabaseAdmin
            .from('user_settings')
            .select('value')
            .eq('key', 'savedPapers')
            .maybeSingle();

        if (settingsError) {
            console.error('[Cleanup Cron] Failed to fetch savedPapers:', settingsError);
            throw new Error('Failed to fetch whitelist');
        }

        const protectedFiles = new Set<string>();
        if (settingsData && Array.isArray(settingsData.value)) {
            settingsData.value.forEach((paper: any) => {
                if (paper.audioUrl) {
                    // Extract filename from URL
                    // Example: https://.../storage/v1/object/public/podcast-audio/podcast_1739180905436.mp3
                    const parts = paper.audioUrl.split('/');
                    const filename = parts[parts.length - 1];
                    if (filename) protectedFiles.add(filename);
                }
            });
        }
        console.log(`[Cleanup Cron] Found ${protectedFiles.size} protected files.`);

        // 3. List all files in 'podcast-audio' bucket
        const { data: files, error: listError } = await supabaseAdmin
            .storage
            .from('podcast-audio')
            .list();

        if (listError) {
            console.error('[Cleanup Cron] Failed to list files:', listError);
            throw new Error('Failed to list storage files');
        }

        if (!files || files.length === 0) {
            console.log('[Cleanup Cron] No files found in storage.');
            return NextResponse.json({ message: 'No files to cleanup' });
        }

        // 4. Identify files to delete
        const filesToDelete: string[] = [];
        const now = Date.now();
        const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

        files.forEach(file => {
            // Check 1: Is it protected?
            if (protectedFiles.has(file.name)) {
                return; // Skip
            }

            // Check 2: Is it older than 24 hours?
            const fileTime = new Date(file.created_at).getTime();
            if (now - fileTime > TWENTY_FOUR_HOURS) {
                filesToDelete.push(file.name);
            }
        });

        console.log(`[Cleanup Cron] Identified ${filesToDelete.length} files to delete (older than 24h & unsaved).`);

        // 5. Delete files
        if (filesToDelete.length > 0) {
            const { error: deleteError } = await supabaseAdmin
                .storage
                .from('podcast-audio')
                .remove(filesToDelete);

            if (deleteError) {
                console.error('[Cleanup Cron] Failed to delete files:', deleteError);
                throw new Error('Failed to delete files');
            }
            console.log('[Cleanup Cron] Deletion successful.');
        }

        return NextResponse.json({
            success: true,
            deletedCount: filesToDelete.length,
            deletedFiles: filesToDelete,
            protectedCount: protectedFiles.size
        });

    } catch (error: any) {
        console.error('[Cleanup Cron] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
