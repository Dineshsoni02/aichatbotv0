'use client';

import { FileText, Download, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface DocumentBadgeProps {
    fileName: string;
    fileUrl?: string;
    mimeType?: string;
    extractionStatus?: 'pending' | 'complete' | 'failed';
    onClick?: () => void;
}

export function DocumentBadge({
    fileName,
    fileUrl,
    mimeType,
    extractionStatus = 'pending',
    onClick,
}: DocumentBadgeProps) {
    const getFileIcon = () => {
        if (mimeType?.includes('pdf')) return '📄';
        if (mimeType?.includes('image')) return '🖼️';
        if (mimeType?.includes('word') || mimeType?.includes('document')) return '📝';
        return '📎';
    };

    const getStatusBadge = () => {
        switch (extractionStatus) {
            case 'pending':
                return (
                    <Badge variant="secondary" className="text-xs">
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        Wird verarbeitet
                    </Badge>
                );
            case 'complete':
                return (
                    <Badge variant="default" className="text-xs bg-green-600">
                        ✓ Extrahiert
                    </Badge>
                );
            case 'failed':
                return (
                    <Badge variant="destructive" className="text-xs">
                        Fehler
                    </Badge>
                );
        }
    };

    return (
        <div
            className="inline-flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg border cursor-pointer hover:bg-muted transition-colors"
            onClick={onClick}
        >
            <span className="text-lg">{getFileIcon()}</span>
            <div className="flex flex-col">
                <span className="text-sm font-medium truncate max-w-[150px]">
                    {fileName}
                </span>
                {getStatusBadge()}
            </div>
            {fileUrl && (
                <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-1 hover:bg-background rounded"
                >
                    <Download className="w-4 h-4 text-muted-foreground" />
                </a>
            )}
        </div>
    );
}

interface DocumentListProps {
    documents: Array<{
        id: string;
        file_name?: string;
        file_url?: string;
        mime_type?: string;
        extracted_text?: string | null;
        text_extraction_meta?: { status?: string } | null;
    }>;
}

export function DocumentList({ documents }: DocumentListProps) {
    if (documents.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-2 p-3 bg-muted/30 rounded-lg">
            <div className="w-full text-xs text-muted-foreground mb-1">
                <FileText className="w-3 h-3 inline mr-1" />
                Hochgeladene Dokumente:
            </div>
            {documents.map((doc) => (
                <DocumentBadge
                    key={doc.id}
                    fileName={doc.file_name || 'Unbekannt'}
                    fileUrl={doc.file_url}
                    mimeType={doc.mime_type}
                    extractionStatus={
                        doc.extracted_text
                            ? 'complete'
                            : doc.text_extraction_meta?.status === 'failed'
                                ? 'failed'
                                : 'pending'
                    }
                />
            ))}
        </div>
    );
}
