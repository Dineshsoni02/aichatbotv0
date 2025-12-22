import { NextResponse } from 'next/server';
import { createServerClient, updateConversationStatus, getCaseTypeIdByName } from '@/lib/supabase-server';
import { validateCaseData, parseGermanDate, type CaseData } from '@/utils/validators';
import { extractCaseData, createStructuredDescription, createCaseSummary } from '@/utils/caseExtractor';

export async function POST(req: Request) {
    try {
        const body: Partial<CaseData> = await req.json();

        // Validate case data
        const validation = validateCaseData(body);
        if (!validation.valid) {
            return NextResponse.json(
                { error: 'Validierungsfehler', details: validation.errors },
                { status: 400 }
            );
        }

        const supabase = createServerClient();

        // Get conversation details
        const { data: conversation, error: convError } = await supabase
            .from('conversations')
            .select('*, person_id')
            .eq('id', body.conversationId)
            .single();

        if (convError || !conversation) {
            return NextResponse.json(
                { error: 'Conversation nicht gefunden' },
                { status: 404 }
            );
        }

        // Get messages and documents for this conversation
        const { data: messages } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', body.conversationId)
            .order('created_at', { ascending: true });

        const { data: documents } = await supabase
            .from('documents')
            .select('*')
            .eq('conversation_id', body.conversationId)
            .order('created_at', { ascending: true });

        // If no structured data provided, extract from conversation
        let descriptionStructured = body.descriptionStructured;
        let descriptionRaw = body.descriptionRaw;

        if (!descriptionStructured && messages) {
            const extraction = extractCaseData(messages, documents || []);
            descriptionStructured = createStructuredDescription(extraction);

            if (!descriptionRaw) {
                descriptionRaw = createCaseSummary(extraction.data);
            }
        }

        // Parse deadline date if provided in German format
        let deadlineDate = null;
        if (body.deadlineDate) {
            deadlineDate = parseGermanDate(body.deadlineDate);
        }

        // Look up case_type_id from case_types table
        const caseTypeId = await getCaseTypeIdByName(body.caseTypeKey);

        // Create case record
        const { data: caseRecord, error: caseError } = await supabase
            .from('cases')
            .insert([{
                conversation_id: body.conversationId,
                person_id: conversation.person_id || null,
                case_type_id: caseTypeId || null,
                title: body.title || 'Neuer Fall',
                description_raw: descriptionRaw || null,
                description_structured: descriptionStructured || null,
                desired_outcome: body.desiredOutcome || null,
                estimated_value: body.estimatedValue || null,
                deadline_date: deadlineDate,
                urgency_level: body.urgencyLevel || 'medium',
                ready_for_bidding: body.readyForBidding ?? false,
                status: 'intake',
            }])
            .select()
            .single();

        if (caseError) {
            console.error('Error creating case:', caseError);
            return NextResponse.json(
                { error: 'Fehler beim Erstellen des Falls' },
                { status: 500 }
            );
        }

        // Update conversation status
        await updateConversationStatus(body.conversationId!, 'case_created');

        // Link any documents to this case
        if (documents && documents.length > 0) {
            await supabase
                .from('documents')
                .update({ linked_case_id: caseRecord.id })
                .eq('conversation_id', body.conversationId);
        }

        // Note: We don't save a system message here since DB only allows user/assistant roles
        // The case creation is tracked via caseRecord.created_at

        return NextResponse.json({
            success: true,
            case: {
                id: caseRecord.id,
                title: caseRecord.title,
                case_type_id: caseRecord.case_type_id,
                urgency_level: caseRecord.urgency_level,
                status: caseRecord.status,
            },
            message: 'Fall erfolgreich erstellt',
        });
    } catch (error) {
        console.error('Case API error:', error);
        return NextResponse.json(
            { error: 'Interner Serverfehler' },
            { status: 500 }
        );
    }
}

// GET endpoint to retrieve case details
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const caseId = searchParams.get('id');
        const conversationId = searchParams.get('conversationId');

        if (!caseId && !conversationId) {
            return NextResponse.json(
                { error: 'Case ID oder Conversation ID erforderlich' },
                { status: 400 }
            );
        }

        const supabase = createServerClient();

        let query = supabase.from('cases').select('*');

        if (caseId) {
            query = query.eq('id', caseId);
        } else if (conversationId) {
            query = query.eq('conversation_id', conversationId);
        }

        const { data: caseRecord, error } = await query.single();

        if (error || !caseRecord) {
            return NextResponse.json(
                { error: 'Fall nicht gefunden' },
                { status: 404 }
            );
        }

        return NextResponse.json({ case: caseRecord });
    } catch (error) {
        console.error('Case GET error:', error);
        return NextResponse.json(
            { error: 'Interner Serverfehler' },
            { status: 500 }
        );
    }
}
