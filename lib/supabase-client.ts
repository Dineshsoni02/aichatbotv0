'use client';

import { createClient } from '@supabase/supabase-js';

// Browser-side Supabase client with anon key
// Use this in client components for RLS-protected access
export function createBrowserClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Missing Supabase environment variables for browser client');
    }

    return createClient(supabaseUrl, supabaseAnonKey);
}

// Singleton instance for client-side usage
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let browserClient: any = null;

export function getSupabaseClient() {
    if (!browserClient) {
        browserClient = createBrowserClient();
    }
    return browserClient;
}
