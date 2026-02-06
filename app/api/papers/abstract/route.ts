import { NextResponse } from 'next/server';
import { fetchPubmedAbstract, fetchKciAbstract } from '@/lib/paperSources';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id') || '';

    if (!id) {
        return NextResponse.json({ error: 'ID parameter is required' }, { status: 400 });
    }

    let abstract: string | null = null;

    if (id.startsWith('pubmed_')) {
        const pmid = id.replace('pubmed_', '');
        abstract = await fetchPubmedAbstract(pmid);
    } else if (id.startsWith('kci_')) {
        const articleId = id.replace('kci_', '');
        abstract = await fetchKciAbstract(articleId);
    } else {
        return NextResponse.json({ error: 'Invalid ID format. Expected pubmed_* or kci_*' }, { status: 400 });
    }

    if (!abstract) {
        return NextResponse.json({ error: 'Abstract not found' }, { status: 404 });
    }

    return NextResponse.json({ id, abstract });
}
