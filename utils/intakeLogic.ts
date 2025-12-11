// Intake Logic - Implements the 7-phase intake flow for legal case intake

import type { Message, Document } from '@/lib/supabase-server';
import { extractCaseData, createCaseSummary, type CaseExtractionResult, type ExtractedCaseData } from './caseExtractor';

/**
 * Intake phases as defined in the spec
 */
export enum IntakePhase {
    FREE_TEXT = 1,
    AUTOMATIC_EXTRACTION = 2,
    TARGETED_QUESTIONS = 3,
    DEADLINES_URGENCY = 4,
    CASE_FILE_GENERATION = 5,
    PERSON_DATA = 6,
    CONSENT = 7,
}

/**
 * State of the intake process
 */
export interface IntakeState {
    phase: IntakePhase;
    extractedData: ExtractedCaseData;
    confidence: number;
    intakeComplete: boolean;
    personDataRequested: boolean;
    consentGiven: boolean;
    deadlinesAsked: boolean;
    questionsAsked: string[];
}

/**
 * Result of intake state update
 */
export interface IntakeUpdateResult {
    state: IntakeState;
    systemPromptAddition?: string;
    suggestedResponse?: string;
    shouldCreateCase: boolean;
    shouldAskForPersonData: boolean;
    shouldAskForConsent: boolean;
}

// Minimum confidence threshold to consider intake complete
const CONFIDENCE_THRESHOLD = 0.6;

// Minimum messages before moving past free text phase
const MIN_MESSAGES_FOR_EXTRACTION = 2;

/**
 * Initializes a new intake state
 */
export function createInitialIntakeState(): IntakeState {
    return {
        phase: IntakePhase.FREE_TEXT,
        extractedData: {},
        confidence: 0,
        intakeComplete: false,
        personDataRequested: false,
        consentGiven: false,
        deadlinesAsked: false,
        questionsAsked: [],
    };
}

/**
 * Updates the intake state based on conversation history and documents
 */
export function updateIntakeState(
    messages: Message[],
    documents: Document[],
    previousState?: IntakeState
): IntakeUpdateResult {
    const state = previousState || createInitialIntakeState();
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    const lastUserMessage = userMessages[userMessages.length - 1];
    const lastUserContent = lastUserMessage?.content.toLowerCase() || '';

    let systemPromptAddition: string | undefined;
    let suggestedResponse: string | undefined;
    let shouldCreateCase = false;
    let shouldAskForPersonData = false;
    let shouldAskForConsent = false;

    // Perform extraction
    const extraction = extractCaseData(messages, documents);
    state.extractedData = extraction.data;
    state.confidence = extraction.confidence.overall;

    // Determine current phase and next actions
    switch (state.phase) {
        case IntakePhase.FREE_TEXT:
            // Stay in free text until we have at least some content
            if (userMessages.length >= MIN_MESSAGES_FOR_EXTRACTION) {
                state.phase = IntakePhase.AUTOMATIC_EXTRACTION;
            }
            systemPromptAddition = generateFreeTextPrompt();
            break;

        case IntakePhase.AUTOMATIC_EXTRACTION:
            // Move to targeted questions if we have gaps
            if (extraction.missingFields.length > 0) {
                state.phase = IntakePhase.TARGETED_QUESTIONS;
            } else if (!state.deadlinesAsked) {
                state.phase = IntakePhase.DEADLINES_URGENCY;
            } else {
                state.phase = IntakePhase.CASE_FILE_GENERATION;
            }
            systemPromptAddition = generateExtractionPrompt(extraction);
            break;

        case IntakePhase.TARGETED_QUESTIONS:
            // Ask max 1-2 targeted questions
            const availableQuestions = extraction.suggestedQuestions.filter(
                q => !state.questionsAsked.includes(q)
            );

            if (availableQuestions.length > 0 && extraction.confidence.overall < CONFIDENCE_THRESHOLD) {
                systemPromptAddition = generateTargetedQuestionsPrompt(availableQuestions.slice(0, 2));
                state.questionsAsked.push(...availableQuestions.slice(0, 2));
            } else if (!state.deadlinesAsked) {
                state.phase = IntakePhase.DEADLINES_URGENCY;
            } else {
                state.phase = IntakePhase.CASE_FILE_GENERATION;
            }
            break;

        case IntakePhase.DEADLINES_URGENCY:
            if (!state.deadlinesAsked) {
                systemPromptAddition = generateDeadlinesPrompt();
                state.deadlinesAsked = true;
            } else {
                state.phase = IntakePhase.CASE_FILE_GENERATION;
            }
            break;

        case IntakePhase.CASE_FILE_GENERATION:
            // Check if confidence is sufficient
            if (extraction.confidence.overall >= CONFIDENCE_THRESHOLD || assistantMessages.length >= 6) {
                const summary = createCaseSummary(extraction.data);
                systemPromptAddition = generateCaseFilePrompt(summary);
                suggestedResponse = generateCaseSummaryResponse(extraction);
                state.intakeComplete = true;

                // Check if user wants to forward to attorney
                if (detectForwardRequest(lastUserContent)) {
                    state.phase = IntakePhase.PERSON_DATA;
                    shouldAskForPersonData = true;
                } else {
                    // Ask about forwarding
                    systemPromptAddition += '\n\nNach der Zusammenfassung frage: "Möchten Sie, dass wir Ihren Fall an eine:n Anwält:in weitergeben?"';
                }
            } else {
                // Need more info, go back to questions
                state.phase = IntakePhase.TARGETED_QUESTIONS;
            }
            break;

        case IntakePhase.PERSON_DATA:
            state.personDataRequested = true;

            // Check if user provided consent keywords
            if (detectConsentIntent(lastUserContent)) {
                state.phase = IntakePhase.CONSENT;
                shouldAskForConsent = true;
            } else if (detectPersonDataProvided(lastUserContent)) {
                state.phase = IntakePhase.CONSENT;
                systemPromptAddition = generateConsentPrompt();
            } else {
                systemPromptAddition = generatePersonDataPrompt();
            }
            break;

        case IntakePhase.CONSENT:
            if (detectConsentGiven(lastUserContent)) {
                state.consentGiven = true;
                shouldCreateCase = true;
                systemPromptAddition = generateConsentConfirmationPrompt();
            } else if (detectConsentDenied(lastUserContent)) {
                state.consentGiven = false;
                systemPromptAddition = 'Der Nutzer hat die Einwilligung abgelehnt. Bedanke dich für das Gespräch und erkläre, dass keine Daten gespeichert werden.';
            } else {
                systemPromptAddition = generateConsentPrompt();
                shouldAskForConsent = true;
            }
            break;
    }

    return {
        state,
        systemPromptAddition,
        suggestedResponse,
        shouldCreateCase: shouldCreateCase || (state.intakeComplete && state.consentGiven),
        shouldAskForPersonData,
        shouldAskForConsent,
    };
}

// Helper functions to detect user intents
function detectForwardRequest(text: string): boolean {
    const patterns = ['ja', 'anwalt', 'anwältin', 'weiterleiten', 'weitergeben', 'gerne'];
    return patterns.some(p => text.includes(p));
}

function detectConsentIntent(text: string): boolean {
    const positivePatterns = ['zustimm', 'einverstanden', 'ok', 'ja', 'genehmig'];
    return positivePatterns.some(p => text.includes(p));
}

function detectPersonDataProvided(text: string): boolean {
    // Check for email pattern
    const hasEmail = /@/.test(text);
    // Check for name pattern (at least two capitalized words)
    const hasName = /[A-ZÄÖÜ][a-zäöüß]+\s+[A-ZÄÖÜ][a-zäöüß]+/.test(text);
    return hasEmail || hasName;
}

function detectConsentGiven(text: string): boolean {
    const positivePatterns = ['ja', 'stimme zu', 'einverstanden', 'genehmigt', 'speichern ja', 'zustimmung'];
    const negativePatterns = ['nein', 'nicht', 'ablehne', 'keine zustimmung'];

    const hasPositive = positivePatterns.some(p => text.includes(p));
    const hasNegative = negativePatterns.some(p => text.includes(p));

    return hasPositive && !hasNegative;
}

function detectConsentDenied(text: string): boolean {
    const negativePatterns = ['nein', 'nicht speichern', 'ablehne', 'keine zustimmung', 'nicht einverstanden'];
    return negativePatterns.some(p => text.includes(p));
}

// Prompt generation functions
function generateFreeTextPrompt(): string {
    return `
Der Nutzer befindet sich in der FREIEN BESCHREIBUNGSPHASE.
- Lass den Nutzer seinen Fall frei beschreiben, ohne zu unterbrechen.
- Wenn Dokumente hochgeladen wurden, behandle deren Inhalt als Teil der Beschreibung.
- Stelle KEINE Rückfragen in dieser Phase, es sei denn, die Beschreibung ist extrem kurz oder unklar.
- Zeige Verständnis und höre aktiv zu.
`;
}

function generateExtractionPrompt(extraction: CaseExtractionResult): string {
    const foundData = Object.entries(extraction.data)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k]) => k)
        .join(', ');

    return `
AUTOMATISCHE EXTRAKTION abgeschlossen.
Gefundene Informationen: ${foundData || 'Noch wenig Daten'}
Gesamtvertrauen: ${(extraction.confidence.overall * 100).toFixed(0)}%
Fehlende Felder: ${extraction.missingFields.join(', ') || 'Keine'}

Fasse kurz zusammen, was du verstanden hast, und stelle dann gezielt Fragen zu fehlenden Informationen (max. 1-2 Fragen).
`;
}

function generateTargetedQuestionsPrompt(questions: string[]): string {
    return `
GEZIELTE FRAGEN-PHASE.
Stelle folgende Fragen (MAXIMAL 1-2 auf einmal):
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Formuliere die Fragen natürlich und höflich auf Deutsch.
`;
}

function generateDeadlinesPrompt(): string {
    return `
FRISTEN-PHASE.
Du MUSST jetzt nach Fristen fragen:
1. "Gibt es eine Frist oder ein wichtiges Datum, das Sie beachten müssen?"
2. "Bis wann wünschen Sie eine Rückmeldung?"

Diese Fragen sind PFLICHT und müssen gestellt werden.
`;
}

function generateCaseFilePrompt(summary: string): string {
    return `
FALLAKTE-GENERIERUNG.
Erstelle eine vollständige Fallzusammenfassung basierend auf folgenden extrahierten Daten:

${summary}

WICHTIG: 
- Beginne mit "Hier ist Ihre Fallzusammenfassung:"
- Formatiere die Zusammenfassung übersichtlich
- Wenn Dokumente verwendet wurden, zitiere sie mit "Laut Dokument..."
- Füge am Ende hinzu: "Hinweis: Dies ist keine Rechtsberatung. Für rechtliche Schritte wenden Sie sich bitte an einen zugelassenen Anwalt."
`;
}

function generateCaseSummaryResponse(extraction: CaseExtractionResult): string {
    return createCaseSummary(extraction.data);
}

function generatePersonDataPrompt(): string {
    return `
PERSONENDATEN-PHASE.
Der Nutzer möchte den Fall an eine:n Anwält:in weitergeben.

Frage nach folgenden Daten (in natürlicher Weise):
- Vollständiger Name
- E-Mail-Adresse
- Mandantentyp (Privatperson oder Unternehmen)
- Optional: Telefonnummer
- Optional (bei Unternehmen): Firmenname
- Optional: Standort/Stadt
- Optional: Bevorzugte Kontaktmethode (E-Mail oder Telefon)

Stelle nicht alle Fragen auf einmal - frage natürlich und höflich.
`;
}

function generateConsentPrompt(): string {
    return `
EINWILLIGUNGS-PHASE.
Du MUSST jetzt explizit um Einwilligung bitten:

"Darf ich Ihre Daten speichern und an eine:n Anwält:in weitergeben?"

Warte auf eine klare Zustimmung (ja/nein) bevor du fortfährst.
Diese Zustimmung ist RECHTLICH ERFORDERLICH.
`;
}

function generateConsentConfirmationPrompt(): string {
    return `
EINWILLIGUNG ERTEILT.
Bestätige dem Nutzer:
- Seine Daten werden sicher gespeichert
- Der Fall wird an geeignete Anwälte weitergeleitet
- Er wird in Kürze kontaktiert

Bedanke dich für das Vertrauen und erkläre die nächsten Schritte.
`;
}

/**
 * Gets the appropriate system prompt addition based on intake state
 */
export function getIntakeSystemPrompt(state: IntakeState): string {
    const phaseDescriptions = {
        [IntakePhase.FREE_TEXT]: 'Freie Beschreibung - höre aktiv zu',
        [IntakePhase.AUTOMATIC_EXTRACTION]: 'Automatische Extraktion läuft',
        [IntakePhase.TARGETED_QUESTIONS]: 'Gezielte Rückfragen (max. 1-2)',
        [IntakePhase.DEADLINES_URGENCY]: 'Fristen und Dringlichkeit erfragen',
        [IntakePhase.CASE_FILE_GENERATION]: 'Fallakte erstellen',
        [IntakePhase.PERSON_DATA]: 'Personendaten erfassen',
        [IntakePhase.CONSENT]: 'Einwilligung einholen',
    };

    return `
[INTAKE STATUS: Phase ${state.phase} - ${phaseDescriptions[state.phase]}]
[Vertrauen: ${(state.confidence * 100).toFixed(0)}%]
[Intake abgeschlossen: ${state.intakeComplete ? 'Ja' : 'Nein'}]

REMINDER: Du gibst KEINE Rechtsberatung. Wenn der Nutzer um rechtlichen Rat fragt, erkläre neutral, dass du nur für die Fallaufnahme zuständig bist.
`;
}
