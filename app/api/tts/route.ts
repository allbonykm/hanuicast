import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import os from 'os';
// @ts-ignore
import { EdgeTTS } from 'node-edge-tts';

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

export async function POST(req: Request) {
    try {
        const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
        const hasAnonKey = !!process.env.SUPABASE_ANON_KEY;

        console.log(`[TTS API] Starting...`);
        console.log(`[TTS API] Key Config Check: ServiceRoleKey=${hasServiceKey}, AnonKey=${hasAnonKey}`);

        if (!hasServiceKey) {
            console.warn('[TTS API] WARNING: SUPABASE_SERVICE_ROLE_KEY is missing. Using Anon Key. Uploads requires RLS policies allowing public inserts.');
        } else {
            console.log('[TTS API] Using Service Role Key (Admin Mode) - RLS bypassed.');
        }

        const { script, title, journal, authors, abstract, originalUrl, tags } = await req.json();

        if (!script) {
            return NextResponse.json({ error: 'Script is required' }, { status: 400 });
        }

        console.log(`[TTS API] Request received for: ${title}`);
        const startTime = Date.now();

        // 1. Generate Audio using node-edge-tts (save to temp file)
        // Helper to remove Markdown syntax to prevent reading special characters
        const cleanText = (text: string) => {
            return text
                .replace(/\*\*\s*.*?\s*:\s*\*\*/g, '') // Remove **Label:** entirely (e.g. **Opening:**)
                .replace(/__\s*.*?\s*:\s*__/g, '')     // Remove __Label:__ entirely
                .replace(/^[AB]\s*:\s*/gm, '')         // Remove "A:", "B:" at start of lines
                .replace(/^(진행자|전문가|원장님)\s*:\s*/gm, '') // Remove common Korean speaker labels
                .replace(/\*\*(.*?)\*\*/g, '$1')       // Bold **text** -> text
                .replace(/__(.*?)__/g, '$1')           // Bold __text__ -> text
                .replace(/^[#]+\s+/gm, '')             // Headers # Header -> Header
                .replace(/`([^`]+)`/g, '$1')           // Inline code `code` -> code
                .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links [text](url) -> text
                .replace(/^\s*[-*+]\s+/gm, '')         // List items - item, * item -> item
                .replace(/\([\u3400-\u9FFF\uF900-\uFAFF\s,]+\)/g, '') // Remove Hanja in parentheses
                .replace(/[\u3400-\u9FFF\uF900-\uFAFF]/g, '')        // Remove standalone Hanja
                .replace(/\n{3,}/g, '\n\n')            // Normalize newlines
                .trim();
        };

        // Helper to split text into chunks
        const chunkText = (text: string, maxLength: number = 500) => {
            const chunks = [];
            let currentChunk = '';
            const sentences = text.split(/([.?!]\s+)/); // Split by sentence endings

            for (const sentence of sentences) {
                if ((currentChunk + sentence).length > maxLength) {
                    chunks.push(currentChunk);
                    currentChunk = sentence;
                } else {
                    currentChunk += sentence;
                }
            }
            if (currentChunk) chunks.push(currentChunk);
            return chunks;
        };

        // Clean script first, then chunk
        const cleanedScript = cleanText(script);
        console.log(`[TTS API] Original script length: ${script.length}, Cleaned length: ${cleanedScript.length}`);

        const scriptChunks = cleanedScript.length > 500 ? chunkText(cleanedScript) : [cleanedScript];
        console.log(`[TTS API] Script split into ${scriptChunks.length} chunks.`);

        // 1. Generate Audio for each chunk and concatenate
        console.log(`[TTS API] Step 1: Generating Audio with node-edge-tts...`);

        const audioBuffers: Buffer[] = [];

        for (let i = 0; i < scriptChunks.length; i++) {
            const chunk = scriptChunks[i];
            const tempFilePath = path.join(os.tmpdir(), `tts_chunk_${Date.now()}_${i}.mp3`);
            console.log(`[TTS API] Processing chunk ${i + 1}/${scriptChunks.length} (${chunk.length} chars)...`);

            let retryCount = 0;
            const maxRetries = 1;
            let success = false;

            while (retryCount <= maxRetries && !success) {
                try {
                    const tts = new EdgeTTS({
                        voice: 'ko-KR-SunHiNeural',
                        lang: 'ko-KR',
                        outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
                    });

                    await tts.ttsPromise(chunk, tempFilePath);
                    const chunkBuffer = fs.readFileSync(tempFilePath);
                    audioBuffers.push(chunkBuffer);
                    try { fs.unlinkSync(tempFilePath); } catch (e) { }
                    success = true;
                    if (i < scriptChunks.length - 1) await new Promise(r => setTimeout(r, 300));
                } catch (chunkErr) {
                    retryCount++;
                    console.error(`[TTS API] Chunk ${i} failed (Attempt ${retryCount}):`, chunkErr);
                    if (retryCount > maxRetries) throw chunkErr;
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
        }

        const buffer = Buffer.concat(audioBuffers);
        console.log(`[TTS API] Total audio buffer size: ${buffer.length} bytes`);

        // 2. Upload to Supabase Storage
        console.log(`[TTS API] Step 2: Uploading to Supabase Storage (podcast-audio)...`);
        const fileName = `podcast_${Date.now()}.mp3`;
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('podcast-audio')
            .upload(fileName, buffer, {
                contentType: 'audio/mpeg',
                upsert: true
            });

        if (uploadError) {
            console.error('[TTS API] Supabase Upload Error:', uploadError);
            throw new Error(`저장소 업로드 실패: ${uploadError.message}`);
        }
        console.log(`[TTS API] Upload successful: ${fileName}`);

        // 3. Get Public URL
        const { data: { publicUrl } } = supabase.storage
            .from('podcast-audio')
            .getPublicUrl(fileName);
        console.log(`[TTS API] Public URL: ${publicUrl}`);

        // 4. Save to Database (Papers Table)
        console.log(`[TTS API] Step 3: Saving metadata to Supabase DB (papers table)...`);
        const { error: dbError } = await supabase
            .from('papers')
            .insert([
                {
                    title,
                    journal,
                    authors,
                    abstract,
                    summary_script: script,
                    audio_url: publicUrl,
                    tags: tags || [],
                    original_url: originalUrl
                }
            ]);

        if (dbError) {
            console.error('[TTS API] Supabase DB Error:', dbError);
            throw new Error(`데이터베이스 저장 실패: ${dbError.message}`);
        }
        console.log(`[TTS API] Database insert successful.`);

        return NextResponse.json({
            success: true,
            audioUrl: publicUrl
        });

    } catch (error: any) {
        console.error('[TTS API] Critical Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
