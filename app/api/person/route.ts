import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { validatePersonData, type PersonData } from '@/utils/validators';

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

interface PersonRequest extends Partial<PersonData> {
    conversationId: string;
}

export async function POST(req: Request) {
    try {
        const body: PersonRequest = await req.json();
        const { conversationId, ...personData } = body;

        // Validate required fields
        if (!conversationId) {
            return NextResponse.json(
                { error: 'Conversation ID erforderlich' },
                { status: 400, headers: corsHeaders }
            );
        }

        // Validate person data
        const validation = validatePersonData(personData);
        if (!validation.valid) {
            return NextResponse.json(
                { error: 'Validierungsfehler', details: validation.errors },
                { status: 400, headers: corsHeaders }
            );
        }

        const supabase = createServerClient();

        // Check if consent was given
        if (!personData.consent_share_with_lawyer) {
            return NextResponse.json(
                { error: 'Einwilligung zur Weitergabe an Anwalt erforderlich' },
                { status: 400, headers: corsHeaders }
            );
        }

        // Create person record
        const { data: person, error: personError } = await supabase
            .from('persons')
            .insert([{
                full_name: personData.full_name,
                email: personData.email,
                phone_number: personData.phone_number || null,
                client_type: personData.client_type,
                company_name: personData.company_name || null,
                location: personData.location || null,
                preferred_contact_method: personData.preferred_contact_method || 'email',
                consent_to_contact: personData.consent_to_contact ?? true,
                consent_share_with_lawyer: personData.consent_share_with_lawyer,
                consent_timestamp: new Date().toISOString(),
            }])
            .select()
            .single();

        if (personError) {
            console.error('Error creating person:', personError);
            return NextResponse.json(
                { error: 'Fehler beim Speichern der Personendaten' },
                { status: 500, headers: corsHeaders }
            );
        }

        // Update conversation with person_id
        const { error: conversationError } = await supabase
            .from('conversations')
            .update({
                person_id: person.id,
                updated_at: new Date().toISOString(),
            })
            .eq('id', conversationId);

        if (conversationError) {
            console.error('Error updating conversation:', conversationError);
            // Don't fail - person was created successfully
        }

        // Note: We don't save a system message here since DB only allows user/assistant roles
        // The consent is tracked via person.consent_timestamp

        return NextResponse.json({
            success: true,
            person: {
                id: person.id,
                full_name: person.full_name,
                email: person.email,
                client_type: person.client_type,
            },
            message: 'Personendaten erfolgreich gespeichert',
        }, { headers: corsHeaders });
    } catch (error) {
        console.error('Person API error:', error);
        return NextResponse.json(
            { error: 'Interner Serverfehler' },
            { status: 500, headers: corsHeaders }
        );
    }
}
