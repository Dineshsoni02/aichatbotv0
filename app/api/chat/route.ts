import { streamText, UIMessage, convertToModelMessages } from 'ai';
import { openai } from '@ai-sdk/openai';
import {
    createConversation,
    getConversation,
    getConversationMessages,
    saveMessage,
    saveDocument,
    getConversationDocuments,
    updateConversationStatus,
    savePerson,
    saveCase,
    linkPersonToConversation,
    getCaseTypeIdByName,
    type Message,
    type Document,
} from '@/lib/supabase-server';
import {
    updateIntakeState,
    getIntakeSystemPrompt,
} from '@/utils/intakeLogic';
import { extractPersonData, isPersonDataComplete } from '@/utils/personExtractor';
import { extractCaseData, createStructuredDescription, createCaseSummary } from '@/utils/caseExtractor';

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;

// CORS headers for cross-origin requests from Lovable frontend
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

// Handle CORS preflight requests
export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: corsHeaders,
    });
}

// System prompt as specified in requirements
const SYSTEM_PROMPT = `Du bist ein deutscher KI-Rechtsassistent für die Erstaufnahme von Rechtsfällen.
Du gibst KEINE Rechtsberatung.
Deine Aufgabe ist es, den Fall des Nutzers strukturiert aufzunehmen, automatisch alle wichtigen Infos zu extrahieren, nur gezielte Rückfragen zu stellen (max. 1–2 gleichzeitig), nach Fristen/Deadlines zu fragen und eine vollständige Fallakte zu erstellen.
Personendaten werden nur abgefragt, wenn der Nutzer ausdrücklich wünscht, den Fall an eine:n Anwält:in weiterzugeben.
Vor Speicherung muss IMMER eine Einwilligung eingeholt werden.
Sprache: Deutsch.
Ton: professionell, ruhig, neutral und vertrauenswürdig.

WICHTIGE REGELN:
1. Lass den Nutzer zuerst seinen Fall frei beschreiben, ohne zu unterbrechen.
2. Extrahiere automatisch: Rechtsgebiet, Parteien (wer gegen wen?), Vertragsart, Timeline, Problemdefinition, Dokumente, Streitwert/wirtschaftliche Relevanz, Ziele des Nutzers, Dringlichkeit.
3. Stelle nur gezielte Rückfragen, wenn wichtige Infos fehlen (max. 1-2 pro Nachricht).
4. Frage nach Fristen: "Gibt es eine Frist oder ein wichtiges Datum?" und "Bis wann wünschen Sie eine Rückmeldung?"
5. Wenn genug Informationen vorliegen, erstelle eine strukturierte Fallzusammenfassung.
6. Frage erst AM ENDE: "Möchten Sie, dass wir Ihren Fall an eine:n Anwält:in weitergeben?"
7. Wenn ja, frage nach: Name, E-Mail, Mandantentyp (privat/Firma), optional Telefon, optional Firmenname, Standort, bevorzugte Kontaktmethode.
8. Hole EXPLIZIT Einwilligung ein: "Darf ich Ihre Daten speichern und an eine:n Anwält:in weitergeben?"
9. Wenn du Informationen aus hochgeladenen Dokumenten verwendest, zitiere sie mit "Laut Dokument [Name]..."
10. Wenn der Nutzer nach rechtlichem Rat fragt, antworte: "Hinweis: Dies ist keine Rechtsberatung. Ich kann Ihre Situation nur aufnehmen und zusammenfassen."

Beginne mit einer freundlichen Begrüßung und bitte den Nutzer, seinen Fall zu beschreiben.`;

interface FileUpload {
    fileName: string;
    fileUrl: string;
    mimeType?: string;
    sizeBytes?: number;
}

interface ChatRequest {
    messages: UIMessage[];
    model: string;
    webSearch: boolean;
    conversationId?: string | null;
    files?: FileUpload[];
}

/**
 * Direct consent detection - checks if user message contains consent patterns
 * This is a simpler alternative to the phase-based detection
 */
function detectUserConsent(messages: Message[]): boolean {
    // Get the last few user messages to check for consent
    const userMessages = messages.filter(m => m.role === 'user');
    const recentUserMessages = userMessages.slice(-3); // Check last 3 user messages

    // Consent patterns (German)
    const consentPatterns = [
        'ja, ich stimme zu',
        'ja ich stimme zu',
        'stimme zu',
        'einverstanden',
        'ja, dürfen sie',
        'ja dürfen sie',
        'ja, speichern',
        'ja speichern',
        'ja, weiterleiten',
        'ja weiterleiten',
        'ja, weitergeben',
        'ja weitergeben',
        'ich bin einverstanden',
        'ich stimme zu',
        'genehmigt',
        'zustimmung erteilt',
        'yes',
        'i agree',
        'i consent'
    ];

    // Negative patterns that override consent
    const negativePatterns = [
        'nein',
        'nicht einverstanden',
        'keine zustimmung',
        'ablehne',
        'nicht speichern'
    ];

    for (const msg of recentUserMessages) {
        const text = msg.content.toLowerCase();

        // Check for negative first
        const hasNegative = negativePatterns.some(p => text.includes(p));
        if (hasNegative) {
            console.log('[CONSENT CHECK] Found negative pattern in:', text);
            continue;
        }

        // Check for consent
        const hasConsent = consentPatterns.some(p => text.includes(p));
        if (hasConsent) {
            console.log('[CONSENT CHECK] ✓ Found consent pattern in:', text);
            return true;
        }
    }

    console.log('[CONSENT CHECK] No consent pattern found in recent messages');
    return false;
}

/**
 * Check if user has provided person data (name + email minimum)
 */
function hasProvidedPersonData(messages: Message[]): boolean {
    const personData = extractPersonData(messages);
    const hasData = isPersonDataComplete(personData);
    console.log('[PERSON DATA CHECK] Has complete data:', hasData, personData);
    return hasData;
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        console.log('[CHAT API] ====== NEW REQUEST ======');
        console.log('[CHAT API] Request body keys:', Object.keys(body));

        const {
            messages,
            model,
            webSearch,
            conversationId,
            files,
        }: ChatRequest = body;

        console.log('[CHAT API] Parsed request:', {
            messageCount: messages?.length,
            model,
            webSearch,
            conversationId,
            filesCount: files?.length
        });

        // Get or create conversation with client-provided ID
        let currentConversationId = conversationId;
        if (currentConversationId) {
            console.log('[CHAT API] Checking if conversation exists:', currentConversationId);
            const existingConversation = await getConversation(currentConversationId);
            console.log('[CHAT API] Existing conversation:', !!existingConversation);

            if (!existingConversation) {
                console.log('[CHAT API] Creating new conversation with ID:', currentConversationId);
                const newConversation = await createConversation(currentConversationId);
                console.log('[CHAT API] Created conversation:', !!newConversation);
                if (!newConversation) {
                    console.error('[CHAT API] Failed to create conversation with ID:', currentConversationId);
                }
            }
        } else {
            console.log('[CHAT API] No conversationId provided, creating new one');
            const conversation = await createConversation();
            console.log('[CHAT API] Created new conversation:', conversation);
            if (conversation) {
                currentConversationId = conversation.id;
            }
        }

        console.log('[CHAT API] Using conversationId:', currentConversationId);

        // Load existing messages and documents from database if we have a conversation
        let dbMessages: Message[] = [];
        let dbDocuments: Document[] = [];

        if (currentConversationId) {
            dbMessages = await getConversationMessages(currentConversationId);
            dbDocuments = await getConversationDocuments(currentConversationId);
            console.log('[CHAT API] Loaded from DB - messages:', dbMessages.length, 'documents:', dbDocuments.length);
        }

        // Save the new user message to database
        const lastUserMessage = messages[messages.length - 1];
        let lastUserContent = '';

        if (lastUserMessage && lastUserMessage.role === 'user' && currentConversationId) {
            // Extract text content from the message parts
            lastUserContent = lastUserMessage.parts
                ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text')
                .map(part => part.text)
                .join('\n') || '';

            console.log('[CHAT API] Last user message content:', lastUserContent.substring(0, 100));

            if (lastUserContent) {
                console.log('[CHAT API] Saving user message to DB...');
                const savedMsg = await saveMessage(currentConversationId, 'user', lastUserContent);
                console.log('[CHAT API] Saved user message:', !!savedMsg);
            }
        }

        // Process file uploads if provided
        if (files && files.length > 0 && currentConversationId) {
            console.log('[CHAT API] Processing', files.length, 'files');
            for (const file of files) {
                const doc = await saveDocument({
                    conversation_id: currentConversationId,
                    file_name: file.fileName,
                    file_url: file.fileUrl,
                    mime_type: file.mimeType,
                    size_bytes: file.sizeBytes,
                    uploaded_by: 'user',
                    extracted_text: undefined,
                    text_extraction_meta: { status: 'pending' },
                });
                console.log('[CHAT API] Saved document:', !!doc);

                if (doc) {
                    await saveMessage(
                        currentConversationId,
                        'user',
                        `[Dokument hochgeladen: ${file.fileName}]`
                    );
                    dbDocuments.push(doc);
                }
            }
        }

        // Refresh messages after saving
        if (currentConversationId) {
            dbMessages = await getConversationMessages(currentConversationId);
            console.log('[CHAT API] After save - messages in DB:', dbMessages.length);
        }

        // Update intake state based on conversation
        const intakeResult = updateIntakeState(dbMessages, dbDocuments);
        const intakePrompt = getIntakeSystemPrompt(intakeResult.state);

        console.log('[CHAT API] Intake state:', {
            phase: intakeResult.state.phase,
            intakeComplete: intakeResult.state.intakeComplete,
            consentGiven: intakeResult.state.consentGiven,
            personDataRequested: intakeResult.state.personDataRequested,
            shouldCreateCase: intakeResult.shouldCreateCase,
            confidence: intakeResult.state.confidence
        });

        // Build document context for the AI
        let documentContext = '';
        if (dbDocuments.length > 0) {
            const docSummaries = dbDocuments.map(d => {
                const textPreview = d.extracted_text
                    ? d.extracted_text.substring(0, 500) + (d.extracted_text.length > 500 ? '...' : '')
                    : 'Text wird noch extrahiert';
                return `- Dokument: "${d.file_name}" (ID: ${d.id})\n  Inhalt: ${textPreview}`;
            }).join('\n');
            documentContext = `\n\nHOCHGELADENE DOKUMENTE:\n${docSummaries}`;
        }

        // Combine system prompts
        const fullSystemPrompt = SYSTEM_PROMPT + '\n\n' + intakePrompt + documentContext +
            (intakeResult.systemPromptAddition ? '\n\n' + intakeResult.systemPromptAddition : '');

        console.log('[CHAT API] Starting streamText...');

        // Stream the response
        const result = streamText({
            model: openai(model.includes('/') ? model.split('/')[1] : model),
            messages: convertToModelMessages(messages),
            system: fullSystemPrompt,
            onFinish: async ({ text }) => {
                console.log('[CHAT API] ====== onFinish CALLED ======');
                console.log('[CHAT API] Response text length:', text?.length);

                if (!currentConversationId) {
                    console.log('[CHAT API] No conversationId, skipping save');
                    return;
                }

                if (!text) {
                    console.log('[CHAT API] No text to save');
                    return;
                }

                // Save assistant response to database
                console.log('[CHAT API] Saving assistant message to DB...');
                const savedAssistant = await saveMessage(currentConversationId, 'assistant', text);
                console.log('[CHAT API] Saved assistant message:', !!savedAssistant);

                // Re-fetch all messages to include the just-saved assistant message
                const allMessages = await getConversationMessages(currentConversationId);
                console.log('[CHAT API] Total messages after save:', allMessages.length);

                // === DIRECT CONSENT CHECK ===
                // Check if user has given consent in any recent message
                const hasConsent = detectUserConsent(allMessages);
                console.log('[CHAT API] Direct consent check result:', hasConsent);

                // Check if we have person data
                const hasPersonData = hasProvidedPersonData(allMessages);
                console.log('[CHAT API] Has person data:', hasPersonData);

                // Also check the phase-based logic
                const updatedIntakeResult = updateIntakeState(allMessages, dbDocuments);
                console.log('[CHAT API] Updated intake state:', {
                    phase: updatedIntakeResult.state.phase,
                    consentGiven: updatedIntakeResult.state.consentGiven,
                    shouldCreateCase: updatedIntakeResult.shouldCreateCase,
                    intakeComplete: updatedIntakeResult.state.intakeComplete
                });

                // Trigger save if EITHER direct consent OR phase-based consent is detected
                const shouldSave = hasConsent ||
                    (updatedIntakeResult.state.consentGiven && updatedIntakeResult.shouldCreateCase);

                console.log('[CHAT API] Should save case:', shouldSave);

                if (shouldSave && hasPersonData) {
                    console.log('[CHAT API] ✓ CONDITIONS MET - Saving person and case data...');

                    try {
                        // 1. Extract person data from conversation
                        const personData = extractPersonData(allMessages);
                        console.log('[CHAT API] Extracted person data:', JSON.stringify(personData, null, 2));

                        // 2. Save person to database
                        let personId: string | undefined;
                        if (isPersonDataComplete(personData)) {
                            console.log('[CHAT API] Person data is complete, saving...');
                            const person = await savePerson({
                                full_name: personData.full_name,
                                email: personData.email,
                                phone_number: personData.phone_number,
                                client_type: personData.client_type || 'private',
                                company_name: personData.company_name,
                                location: personData.location,
                                preferred_contact_method: personData.preferred_contact_method || 'email',
                                consent_share_with_lawyer: true,
                                consent_to_contact: true,
                            });

                            if (person) {
                                personId = person.id;
                                console.log('[CHAT API] ✓ Person saved with ID:', person.id);

                                // Link person to conversation
                                await linkPersonToConversation(currentConversationId, person.id);
                                console.log('[CHAT API] ✓ Person linked to conversation');
                            } else {
                                console.log('[CHAT API] ✗ Failed to save person');
                            }
                        } else {
                            console.log('[CHAT API] Person data incomplete, skipping person creation');
                        }

                        // 3. Extract case data
                        const extraction = extractCaseData(allMessages, dbDocuments);
                        console.log('[CHAT API] Extracted case data:', {
                            rechtsgebiet: extraction.data.rechtsgebiet,
                            problemdefinition: extraction.data.problemdefinition?.substring(0, 50),
                            confidence: extraction.confidence.overall
                        });

                        // 4. Look up case_type_id
                        const caseTypeId = await getCaseTypeIdByName(extraction.data.rechtsgebiet);
                        console.log('[CHAT API] Case type ID:', caseTypeId);

                        // 5. Parse deadline date if available
                        let deadlineDate: string | undefined;
                        if (extraction.data.deadlines && extraction.data.deadlines.length > 0) {
                            const firstDeadline = extraction.data.deadlines[0].datum;
                            const dateMatch = firstDeadline.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
                            if (dateMatch) {
                                deadlineDate = `${dateMatch[3]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}`;
                            }
                        }

                        // 6. Save case to database
                        console.log('[CHAT API] Saving case to database...');
                        const caseRecord = await saveCase({
                            conversation_id: currentConversationId,
                            person_id: personId,
                            case_type_id: caseTypeId || undefined,
                            title: extraction.data.rechtsgebiet || 'Neuer Fall',
                            description_raw: createCaseSummary(extraction.data),
                            description_structured: createStructuredDescription(extraction),
                            desired_outcome: extraction.data.ziele,
                            urgency_level: extraction.data.dringlichkeit || 'medium',
                            deadline_date: deadlineDate,
                            status: 'intake',
                            ready_for_bidding: false,
                        });

                        if (caseRecord) {
                            console.log('[CHAT API] ✓ Case created with ID:', caseRecord.id);
                            await updateConversationStatus(currentConversationId, 'case_created');
                            console.log('[CHAT API] ✓ Conversation status updated to case_created');
                        } else {
                            console.log('[CHAT API] ✗ Failed to save case');
                        }
                    } catch (error) {
                        console.error('[CHAT API] ✗ Error auto-saving case/person:', error);
                    }
                } else if (shouldSave && !hasPersonData) {
                    console.log('[CHAT API] Consent given but no person data yet - waiting for user to provide details');
                } else if (updatedIntakeResult.state.intakeComplete) {
                    console.log('[CHAT API] Intake complete but no consent yet');
                    await updateConversationStatus(currentConversationId, 'intake_complete');
                } else {
                    console.log('[CHAT API] Neither consent nor intake complete - continuing conversation');
                }

                console.log('[CHAT API] ====== onFinish COMPLETE ======');
            },
        });

        // Return streaming response with metadata and proper headers
        return result.toUIMessageStreamResponse({
            sendSources: true,
            sendReasoning: true,
            headers: {
                ...corsHeaders,
                'Transfer-Encoding': 'chunked',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache, no-transform',
            },
        });
    } catch (error) {
        console.error('[CHAT API] Error:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
}