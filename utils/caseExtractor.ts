// Case Extractor - Extracts structured data from conversation messages and documents

import type { Message, Document } from '@/lib/supabase-server';

/**
 * Structured case data extracted from intake conversation
 */
export interface ExtractedCaseData {
    rechtsgebiet?: string; // Legal area (e.g., Mietrecht, Arbeitsrecht)
    parteien?: {
        klaeger?: string; // Plaintiff
        beklagter?: string; // Defendant
        weitere?: string[]; // Other parties
    };
    vertragsart?: string; // Contract type
    timeline?: Array<{
        datum?: string; // Date
        ereignis: string; // Event
        dokumentId?: string; // Referenced document ID
    }>;
    problemdefinition?: string; // Problem definition
    dokumente?: Array<{
        id: string;
        name: string;
        beschreibung?: string;
    }>;
    streitwert?: {
        betrag?: number;
        waehrung?: string;
        schaetzung?: boolean;
    };
    ziele?: string; // User's goals
    dringlichkeit?: 'low' | 'medium' | 'high';
    deadlines?: Array<{
        datum: string;
        beschreibung: string;
        kritisch?: boolean;
    }>;
    zusammenfassung?: string; // AI-generated summary
}

/**
 * Confidence scores for extracted data
 */
export interface ExtractionConfidence {
    overall: number; // 0-1
    rechtsgebiet: number;
    parteien: number;
    timeline: number;
    problemdefinition: number;
    deadlines: number;
}

/**
 * Result of case extraction
 */
export interface CaseExtractionResult {
    data: ExtractedCaseData;
    confidence: ExtractionConfidence;
    missingFields: string[];
    suggestedQuestions: string[];
}

// German legal area keywords for classification
const RECHTSGEBIET_KEYWORDS: Record<string, string[]> = {
    'Mietrecht': ['miete', 'vermieter', 'mieter', 'wohnung', 'mieterhöhung', 'kündigung', 'mietvertrag', 'kaution', 'nebenkosten'],
    'Arbeitsrecht': ['arbeit', 'chef', 'kündigung', 'arbeitsvertrag', 'gehalt', 'lohn', 'abmahnung', 'arbeitgeber', 'arbeitnehmer'],
    'Familienrecht': ['scheidung', 'ehe', 'unterhalt', 'sorgerecht', 'kind', 'trennung', 'ehepartner'],
    'Verkehrsrecht': ['unfall', 'auto', 'fahrzeug', 'verkehr', 'schaden', 'versicherung', 'polizei', 'fahrrad'],
    'Vertragsrecht': ['vertrag', 'vereinbarung', 'kaufvertrag', 'lieferung', 'zahlung', 'forderung', 'mahnung'],
    'Strafrecht': ['anzeige', 'polizei', 'straftat', 'diebstahl', 'betrug', 'staatsanwalt', 'gericht'],
    'Erbrecht': ['erbe', 'testament', 'erbschaft', 'nachlass', 'pflichtteil', 'verstorben'],
    'Sozialrecht': ['rente', 'krankenkasse', 'arbeitslosengeld', 'sozialleistung', 'behinderung'],
};

// Urgency keywords
const URGENCY_KEYWORDS = {
    high: ['dringend', 'sofort', 'eilig', 'frist morgen', 'übermorgen', 'diese woche', 'heute'],
    medium: ['bald', 'zeitnah', 'nächste woche', 'nächsten monat'],
    low: ['irgendwann', 'keine eile', 'wenn zeit ist'],
};

/**
 * Extracts structured case data from conversation messages and documents
 */
export function extractCaseData(
    messages: Message[],
    documents: Document[]
): CaseExtractionResult {
    const userMessages = messages.filter(m => m.role === 'user');
    const allText = [
        ...userMessages.map(m => m.content),
        ...documents.map(d => d.extracted_text || ''),
    ].join('\n').toLowerCase();

    const data: ExtractedCaseData = {};
    const confidence: ExtractionConfidence = {
        overall: 0,
        rechtsgebiet: 0,
        parteien: 0,
        timeline: 0,
        problemdefinition: 0,
        deadlines: 0,
    };
    const missingFields: string[] = [];
    const suggestedQuestions: string[] = [];

    // Extract Rechtsgebiet (Legal Area)
    data.rechtsgebiet = detectRechtsgebiet(allText);
    confidence.rechtsgebiet = data.rechtsgebiet ? 0.8 : 0;
    if (!data.rechtsgebiet) {
        missingFields.push('Rechtsgebiet');
        suggestedQuestions.push('Um welche Art von Rechtsproblem handelt es sich?');
    }

    // Extract Parteien (Parties)
    data.parteien = extractParteien(allText);
    confidence.parteien = data.parteien?.klaeger && data.parteien?.beklagter ? 0.7 : 0.3;
    if (!data.parteien?.klaeger || !data.parteien?.beklagter) {
        missingFields.push('Parteien');
        suggestedQuestions.push('Wer sind die beteiligten Parteien (Sie und die Gegenseite)?');
    }

    // Extract Timeline
    data.timeline = extractTimeline(userMessages, documents);
    confidence.timeline = data.timeline && data.timeline.length > 0 ? 0.6 : 0;
    if (!data.timeline || data.timeline.length === 0) {
        missingFields.push('Timeline');
        suggestedQuestions.push('Können Sie den zeitlichen Ablauf der Ereignisse beschreiben?');
    }

    // Extract Problemdefinition
    data.problemdefinition = extractProblemDefinition(userMessages);
    confidence.problemdefinition = data.problemdefinition ? 0.7 : 0;
    if (!data.problemdefinition) {
        missingFields.push('Problemdefinition');
    }

    // Extract Dringlichkeit
    data.dringlichkeit = detectUrgency(allText);

    // Extract Deadlines
    data.deadlines = extractDeadlines(allText);
    confidence.deadlines = data.deadlines && data.deadlines.length > 0 ? 0.8 : 0;
    if (!data.deadlines || data.deadlines.length === 0) {
        missingFields.push('Fristen');
        suggestedQuestions.push('Gibt es eine Frist oder ein wichtiges Datum?');
    }

    // Add documents list
    if (documents.length > 0) {
        data.dokumente = documents.map(d => ({
            id: d.id,
            name: d.file_name || 'Unbekanntes Dokument',
            beschreibung: d.extracted_text?.substring(0, 200),
        }));
    }

    // Calculate overall confidence
    const confidenceValues = [
        confidence.rechtsgebiet,
        confidence.parteien,
        confidence.timeline,
        confidence.problemdefinition,
        confidence.deadlines,
    ];
    confidence.overall = confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length;

    // Limit suggested questions to 2
    const limitedQuestions = suggestedQuestions.slice(0, 2);

    return {
        data,
        confidence,
        missingFields,
        suggestedQuestions: limitedQuestions,
    };
}

/**
 * Detects the legal area from text
 */
function detectRechtsgebiet(text: string): string | undefined {
    let maxScore = 0;
    let detectedArea: string | undefined;

    for (const [area, keywords] of Object.entries(RECHTSGEBIET_KEYWORDS)) {
        const score = keywords.filter(kw => text.includes(kw)).length;
        if (score > maxScore) {
            maxScore = score;
            detectedArea = area;
        }
    }

    return maxScore >= 2 ? detectedArea : undefined;
}

/**
 * Extracts parties from text
 */
function extractParteien(text: string): ExtractedCaseData['parteien'] {
    const result: ExtractedCaseData['parteien'] = {};

    // Simple heuristics - in production would use NER
    if (text.includes('ich') || text.includes('mein') || text.includes('mir')) {
        result.klaeger = 'Mandant';
    }

    // Detect common opponent patterns
    const opponentPatterns = [
        /mein(?:e)?\s+(vermieter|arbeitgeber|chef|bank|versicherung|nachbar)/i,
        /die\s+(firma|gesellschaft|behörde|stadt|gemeinde)/i,
        /gegen\s+(\w+)/i,
    ];

    for (const pattern of opponentPatterns) {
        const match = text.match(pattern);
        if (match) {
            result.beklagter = match[1].charAt(0).toUpperCase() + match[1].slice(1);
            break;
        }
    }

    return result;
}

/**
 * Extracts timeline events from messages and documents
 */
function extractTimeline(
    messages: Message[],
    documents: Document[]
): ExtractedCaseData['timeline'] {
    const timeline: ExtractedCaseData['timeline'] = [];

    // Date patterns (German format)
    const datePattern = /(\d{1,2})\.(\d{1,2})\.(\d{2,4})/g;

    for (const msg of messages) {
        const dates = msg.content.match(datePattern);
        if (dates) {
            for (const date of dates) {
                // Find context around the date
                const index = msg.content.indexOf(date);
                const context = msg.content.substring(
                    Math.max(0, index - 50),
                    Math.min(msg.content.length, index + 100)
                );
                timeline.push({
                    datum: date,
                    ereignis: context.trim(),
                });
            }
        }
    }

    // Also check documents for dates
    for (const doc of documents) {
        if (doc.extracted_text) {
            const dates = doc.extracted_text.match(datePattern);
            if (dates && dates.length > 0) {
                timeline.push({
                    datum: dates[0],
                    ereignis: `Datum aus Dokument "${doc.file_name}"`,
                    dokumentId: doc.id,
                });
            }
        }
    }

    return timeline;
}

/**
 * Extracts problem definition from user messages
 */
function extractProblemDefinition(messages: Message[]): string | undefined {
    const userMessages = messages.filter(m => m.role === 'user');
    if (userMessages.length === 0) return undefined;

    // First message usually contains the main problem
    const firstMessage = userMessages[0].content;
    if (firstMessage.length > 50) {
        return firstMessage.substring(0, 500);
    }

    // Combine first few messages
    return userMessages
        .slice(0, 3)
        .map(m => m.content)
        .join(' ')
        .substring(0, 500);
}

/**
 * Detects urgency level from text
 */
function detectUrgency(text: string): 'low' | 'medium' | 'high' {
    for (const keyword of URGENCY_KEYWORDS.high) {
        if (text.includes(keyword)) return 'high';
    }
    for (const keyword of URGENCY_KEYWORDS.medium) {
        if (text.includes(keyword)) return 'medium';
    }
    return 'low';
}

/**
 * Extracts deadline information from text
 */
function extractDeadlines(text: string): ExtractedCaseData['deadlines'] {
    const deadlines: ExtractedCaseData['deadlines'] = [];

    // Look for deadline patterns
    const deadlinePatterns = [
        /frist\s+(?:bis\s+)?(?:zum\s+)?(\d{1,2}\.\d{1,2}\.\d{2,4})/gi,
        /bis\s+(?:zum\s+)?(\d{1,2}\.\d{1,2}\.\d{2,4})\s+(?:muss|müssen)/gi,
        /(?:einspruch|widerspruch|antwort)\s+bis\s+(\d{1,2}\.\d{1,2}\.\d{2,4})/gi,
    ];

    for (const pattern of deadlinePatterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const dateMatch = match[1];
            const context = text.substring(
                Math.max(0, match.index - 30),
                Math.min(text.length, match.index + match[0].length + 30)
            );
            deadlines.push({
                datum: dateMatch,
                beschreibung: context.trim(),
                kritisch: text.includes('frist') || text.includes('einspruch'),
            });
        }
    }

    return deadlines;
}

/**
 * Creates description_structured JSON for cases table
 */
export function createStructuredDescription(
    extractionResult: CaseExtractionResult
): Record<string, unknown> {
    return {
        ...extractionResult.data,
        extractionConfidence: extractionResult.confidence,
        extractedAt: new Date().toISOString(),
    };
}

/**
 * Creates human-readable case summary in German
 */
export function createCaseSummary(data: ExtractedCaseData): string {
    const parts: string[] = [];

    if (data.rechtsgebiet) {
        parts.push(`**Rechtsgebiet:** ${data.rechtsgebiet}`);
    }

    if (data.parteien) {
        const parteienStr = [];
        if (data.parteien.klaeger) parteienStr.push(`Mandant: ${data.parteien.klaeger}`);
        if (data.parteien.beklagter) parteienStr.push(`Gegenseite: ${data.parteien.beklagter}`);
        if (parteienStr.length > 0) {
            parts.push(`**Parteien:** ${parteienStr.join(', ')}`);
        }
    }

    if (data.problemdefinition) {
        parts.push(`**Sachverhalt:** ${data.problemdefinition}`);
    }

    if (data.timeline && data.timeline.length > 0) {
        const timelineStr = data.timeline
            .map(t => `- ${t.datum || 'Ohne Datum'}: ${t.ereignis}`)
            .join('\n');
        parts.push(`**Chronologie:**\n${timelineStr}`);
    }

    if (data.deadlines && data.deadlines.length > 0) {
        const deadlinesStr = data.deadlines
            .map(d => `- ${d.datum}: ${d.beschreibung}${d.kritisch ? ' ⚠️' : ''}`)
            .join('\n');
        parts.push(`**Fristen:**\n${deadlinesStr}`);
    }

    if (data.dokumente && data.dokumente.length > 0) {
        const docsStr = data.dokumente.map(d => `- ${d.name}`).join('\n');
        parts.push(`**Dokumente:**\n${docsStr}`);
    }

    if (data.dringlichkeit) {
        const urgencyMap = { low: 'Niedrig', medium: 'Mittel', high: 'Hoch' };
        parts.push(`**Dringlichkeit:** ${urgencyMap[data.dringlichkeit]}`);
    }

    return parts.join('\n\n');
}
