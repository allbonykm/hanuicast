import { NextResponse } from 'next/server';
import { fetchRelatedPapers } from '@/lib/paperSources';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const paperId = searchParams.get('id');
    const source = searchParams.get('source') || '';
    const title = searchParams.get('title') || '';

    if (!paperId) {
        return NextResponse.json({ error: 'Paper ID is required' }, { status: 400 });
    }

    try {
        const relatedPapers = await fetchRelatedPapers(paperId, source, title);
        return NextResponse.json({ papers: relatedPapers });
    } catch (error: any) {
        console.error('[Related Papers API] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
