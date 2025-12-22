import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client with service role key
// Use this in API routes for full access to data
export function createServerClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
        throw new Error('Missing Supabase environment variables for server client');
    }

    return createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}

// Database types for type safety
export interface Conversation {
    id: string;
    created_at: string;
    updated_at?: string;
    person_id?: string;
    status?: 'open' | 'intake_complete' | 'case_created' | 'closed';
    metadata?: Record<string, unknown>;
}

export interface Message {
    id: string;
    created_at: string;
    conversation_id: string;
    role: 'user' | 'assistant';
    content: string;
}

export interface Document {
    id: string;
    created_at: string;
    conversation_id?: string;
    uploaded_by?: string;
    file_name?: string;
    file_url?: string;
    mime_type?: string;
    size_bytes?: number;
    extracted_text?: string;
    text_extraction_meta?: Record<string, unknown>;
    linked_case_id?: string;
}

export interface Person {
    id: string;
    created_at: string;
    full_name: string;
    email: string;
    phone_number?: string;
    client_type: 'private' | 'company';
    company_name?: string;
    location?: string;
    preferred_contact_method?: 'email' | 'phone';
    consent_to_contact: boolean;
    consent_share_with_lawyer: boolean;
    consent_timestamp?: string;
}

export interface Case {
    id: string;
    created_at: string;
    conversation_id?: string;
    person_id?: string;
    case_type_id?: number;  // FK to case_types table
    title?: string;
    description_raw?: string;
    description_structured?: Record<string, unknown>;
    desired_outcome?: string;
    estimated_value?: number;
    deadline_date?: string;
    urgency_level?: 'low' | 'medium' | 'high';
    ready_for_bidding?: boolean;
    status?: 'intake' | 'ready_for_lawyer' | 'in_bidding' | 'assigned' | 'completed';
}

// Helper functions for common database operations
export async function getConversation(id: string): Promise<Conversation | null> {
    const supabase = createServerClient();
    const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error fetching conversation:', error);
        return null;
    }
    return data;
}

export async function createConversation(id?: string): Promise<Conversation | null> {
    const supabase = createServerClient();
    const insertData = id ? { id, status: 'open' } : { status: 'open' };
    const { data, error } = await supabase
        .from('conversations')
        .insert([insertData])
        .select()
        .single();

    if (error) {
        console.error('Error creating conversation:', error);
        return null;
    }
    return data;
}

export async function getConversationMessages(conversationId: string): Promise<Message[]> {
    const supabase = createServerClient();
    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching messages:', error);
        return [];
    }
    return data || [];
}

export async function saveMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string
): Promise<Message | null> {
    const supabase = createServerClient();
    const { data, error } = await supabase
        .from('messages')
        .insert([{ conversation_id: conversationId, role, content }])
        .select()
        .single();

    if (error) {
        console.error('Error saving message:', error);
        return null;
    }
    return data;
}

export async function getConversationDocuments(conversationId: string): Promise<Document[]> {
    const supabase = createServerClient();
    const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching documents:', error);
        return [];
    }
    return data || [];
}

export async function saveDocument(doc: Partial<Document>): Promise<Document | null> {
    const supabase = createServerClient();
    const { data, error } = await supabase
        .from('documents')
        .insert([doc])
        .select()
        .single();

    if (error) {
        console.error('Error saving document:', error);
        return null;
    }
    return data;
}

export async function updateConversationStatus(
    conversationId: string,
    status: Conversation['status']
): Promise<boolean> {
    const supabase = createServerClient();
    const { error } = await supabase
        .from('conversations')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', conversationId);

    if (error) {
        console.error('Error updating conversation status:', error);
        return false;
    }
    return true;
}

/**
 * Looks up case_type_id from the case_types table by name/key
 */
export async function getCaseTypeIdByName(name?: string): Promise<number | null> {
    if (!name) return null;

    const supabase = createServerClient();
    const { data, error } = await supabase
        .from('case_types')
        .select('id')
        .ilike('name', `%${name}%`)
        .limit(1)
        .single();

    if (error) {
        console.error('Error looking up case type:', error);
        return null;
    }
    return data?.id || null;
}

/**
 * Saves a person record to the database
 */
export async function savePerson(personData: Partial<Person>): Promise<Person | null> {
    const supabase = createServerClient();
    const { data, error } = await supabase
        .from('persons')
        .insert([personData])
        .select()
        .single();

    if (error) {
        console.error('Error saving person:', error);
        return null;
    }
    return data;
}

/**
 * Saves a case record to the database
 */
export async function saveCase(caseData: Partial<Case>): Promise<Case | null> {
    const supabase = createServerClient();
    const { data, error } = await supabase
        .from('cases')
        .insert([caseData])
        .select()
        .single();

    if (error) {
        console.error('Error saving case:', error);
        return null;
    }
    return data;
}

/**
 * Links a person to a conversation
 */
export async function linkPersonToConversation(
    conversationId: string,
    personId: string
): Promise<boolean> {
    const supabase = createServerClient();
    const { error } = await supabase
        .from('conversations')
        .update({ person_id: personId, updated_at: new Date().toISOString() })
        .eq('id', conversationId);

    if (error) {
        console.error('Error linking person to conversation:', error);
        return false;
    }
    return true;
}

