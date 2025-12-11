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
    type Message,
    type Document,
} from '@/lib/supabase-server';
import {
    updateIntakeState,
    getIntakeSystemPrompt,
} from '@/utils/intakeLogic';

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;

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

export async function POST(req: Request) {
    try {
        const body = await req.json();
        console.log('[CHAT API] Received request body:', JSON.stringify(body, null, 2));

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
            // Check if this conversation exists in DB
            const existingConversation = await getConversation(currentConversationId);
            console.log('[CHAT API] Existing conversation:', existingConversation);

            if (!existingConversation) {
                console.log('[CHAT API] Creating new conversation with ID:', currentConversationId);
                // Create new conversation with the client-provided ID
                const newConversation = await createConversation(currentConversationId);
                console.log('[CHAT API] Created conversation:', newConversation);
                if (!newConversation) {
                    console.error('[CHAT API] Failed to create conversation with ID:', currentConversationId);
                }
            }
        } else {
            console.log('[CHAT API] No conversationId provided, creating new one');
            // No conversation ID provided, create a new one
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
        console.log('[CHAT API] Last user message:', lastUserMessage);

        if (lastUserMessage && lastUserMessage.role === 'user' && currentConversationId) {
            // Extract text content from the message parts
            const textContent = lastUserMessage.parts
                ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text')
                .map(part => part.text)
                .join('\n') || '';

            console.log('[CHAT API] Extracted text content:', textContent);

            if (textContent) {
                console.log('[CHAT API] Saving user message to DB...');
                const savedMsg = await saveMessage(currentConversationId, 'user', textContent);
                console.log('[CHAT API] Saved user message:', savedMsg);
            }
        }

        // Process file uploads if provided
        if (files && files.length > 0 && currentConversationId) {
            console.log('[CHAT API] Processing', files.length, 'files');
            for (const file of files) {
                // Save document metadata to database
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
                console.log('[CHAT API] Saved document:', doc);

                if (doc) {
                    // Save a message noting the file upload
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
                console.log('[CHAT API] onFinish called, text length:', text?.length);
                // Save assistant response to database
                if (currentConversationId && text) {
                    console.log('[CHAT API] Saving assistant message to DB...');
                    const savedAssistant = await saveMessage(currentConversationId, 'assistant', text);
                    console.log('[CHAT API] Saved assistant message:', savedAssistant);

                    // Update conversation status if intake is complete
                    if (intakeResult.state.intakeComplete) {
                        await updateConversationStatus(currentConversationId, 'intake_complete');
                    }
                }
            },
        });

        // Return streaming response with metadata
        return result.toUIMessageStreamResponse({
            sendSources: true,
            sendReasoning: true,
        });
    } catch (error) {
        console.error('[CHAT API] Error:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}