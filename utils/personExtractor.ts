// Person Extractor - Extracts person data from conversation messages

import type { Message } from '@/lib/supabase-server';

/**
 * Extracted person data from intake conversation
 */
export interface ExtractedPersonData {
    full_name?: string;
    email?: string;
    phone_number?: string;
    client_type?: 'private' | 'company';
    company_name?: string;
    location?: string;
    preferred_contact_method?: 'email' | 'phone';
}

/**
 * Extracts person data from conversation messages
 */
export function extractPersonData(messages: Message[]): ExtractedPersonData {
    const userMessages = messages.filter(m => m.role === 'user');
    const allUserText = userMessages.map(m => m.content).join('\n');

    const data: ExtractedPersonData = {};

    // Extract email
    data.email = extractEmail(allUserText);

    // Extract phone number
    data.phone_number = extractPhoneNumber(allUserText);

    // Extract name
    data.full_name = extractName(allUserText);

    // Detect client type
    data.client_type = detectClientType(allUserText);

    // Extract company name if company client
    if (data.client_type === 'company') {
        data.company_name = extractCompanyName(allUserText);
    }

    // Extract location
    data.location = extractLocation(allUserText);

    // Detect preferred contact method
    data.preferred_contact_method = detectContactMethod(allUserText);

    return data;
}

/**
 * Extracts email address from text
 */
function extractEmail(text: string): string | undefined {
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = text.match(emailPattern);
    return matches ? matches[0] : undefined;
}

/**
 * Extracts German phone number from text
 */
function extractPhoneNumber(text: string): string | undefined {
    // German phone patterns: +49, 0049, or starting with 0
    const phonePatterns = [
        /(\+49|0049)[\s.-]?\d{2,4}[\s.-]?\d{3,8}[\s.-]?\d{0,6}/g,
        /0\d{2,4}[\s./-]?\d{3,8}[\s./-]?\d{0,6}/g,
    ];

    for (const pattern of phonePatterns) {
        const matches = text.match(pattern);
        if (matches) {
            // Clean up the phone number
            return matches[0].replace(/[\s.-]/g, '').trim();
        }
    }
    return undefined;
}

/**
 * Extracts name from text
 * Handles various formats: "Mein Name ist...", "Ich bin...", capitalized words, or simple standalone names
 */
function extractName(text: string): string | undefined {
    // Pattern 1: Explicit name patterns (German)
    const namePatterns = [
        /(?:mein name ist|ich heiße|ich bin|name:|name\s+ist)\s*([A-Za-zÄÖÜäöüß]+(?:\s+[A-Za-zÄÖÜäöüß]+)*)/i,
        /(?:mit freundlichen grüßen|grüße|viele grüße)[,\s]*([A-Za-zÄÖÜäöüß]+(?:\s+[A-Za-zÄÖÜäöüß]+)+)/i,
    ];

    for (const pattern of namePatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            const name = match[1].trim();
            // Capitalize first letter of each word
            return capitalizeWords(name);
        }
    }

    // Pattern 2: Look for lines that could be names
    // Check each line for potential name (before email, short text that looks like a name)
    const lines = text.split('\n');

    // Words that are NOT names
    const nonNameWords = [
        'yes', 'no', 'ja', 'nein', 'ok', 'okay', 'private', 'privat', 'company', 'firma',
        'email', 'phone', 'telefon', 'hallo', 'hello', 'hi', 'danke', 'thanks', 'bitte',
        'mit freundlichen', 'viele grüße', 'beste grüße', 'mfg', 'lg'
    ];

    for (const line of lines) {
        const trimmed = line.trim();
        const lowerTrimmed = trimmed.toLowerCase();

        // Skip empty lines
        if (!trimmed) continue;

        // Skip if it's an email
        if (trimmed.includes('@')) continue;

        // Skip if it contains numbers (probably not a name)
        if (/\d/.test(trimmed)) continue;

        // Skip known non-name words
        if (nonNameWords.some(w => lowerTrimmed === w || lowerTrimmed.includes(w))) continue;

        // Check if it looks like a name (1-4 words, only letters)
        const words = trimmed.split(/\s+/);
        if (words.length >= 1 && words.length <= 4) {
            // Check all words are alphabetic (allow umlauts)
            const allAlphabetic = words.every(w => /^[A-Za-zÄÖÜäöüß]+$/.test(w));
            if (allAlphabetic) {
                // It's likely a name - capitalize and return
                console.log('[NAME EXTRACT] Found potential name:', trimmed);
                return capitalizeWords(trimmed);
            }
        }
    }

    return undefined;
}

/**
 * Capitalizes the first letter of each word
 */
function capitalizeWords(str: string): string {
    return str.split(/\s+/).map(word =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
}

/**
 * Detects if client is private or company
 */
function detectClientType(text: string): 'private' | 'company' {
    const lowerText = text.toLowerCase();

    const companyIndicators = [
        'firma', 'unternehmen', 'gmbh', 'ag', 'ohg', 'kg', 'ug',
        'geschäftsführer', 'geschäftlich', 'betrieb', 'gesellschaft',
        'konzern', 'holding', 'gbr', 'e.v.', 'verein'
    ];

    const privateIndicators = [
        'privat', 'privatperson', 'persönlich', 'als privatperson'
    ];

    // Check for explicit private mention
    for (const indicator of privateIndicators) {
        if (lowerText.includes(indicator)) {
            return 'private';
        }
    }

    // Check for company indicators
    for (const indicator of companyIndicators) {
        if (lowerText.includes(indicator)) {
            return 'company';
        }
    }

    // Default to private
    return 'private';
}

/**
 * Extracts company name from text
 */
function extractCompanyName(text: string): string | undefined {
    // Look for company name patterns
    const companyPatterns = [
        /(?:firma|unternehmen|company)[\s:]+([A-ZÄÖÜ][^\n,]+(?:gmbh|ag|ohg|kg|ug|gbr|e\.v\.)?)/i,
        /([A-ZÄÖÜ][^\n,]+(?:GmbH|AG|OHG|KG|UG|GbR|e\.V\.))/,
    ];

    for (const pattern of companyPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            return match[1].trim();
        }
    }

    return undefined;
}

/**
 * Extracts location/city from text
 */
function extractLocation(text: string): string | undefined {
    const lowerText = text.toLowerCase();

    // Pattern 1: "aus X" or "in X" or "wohne in X"
    const locationPatterns = [
        /(?:aus|in|wohne in|komme aus|standort[:\s]+)[\s]*([A-ZÄÖÜ][a-zäöüß]+(?:\s+[a-zäöüß]+)?)/i,
        /(?:stadt|ort)[:\s]+([A-ZÄÖÜ][a-zäöüß]+)/i,
    ];

    for (const pattern of locationPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            // Filter out common non-location words
            const nonLocations = ['deutschland', 'österreich', 'schweiz', 'europa'];
            if (!nonLocations.includes(match[1].toLowerCase())) {
                return match[1].trim();
            }
        }
    }

    // Check for German postal code + city pattern
    const plzPattern = /\b\d{5}\s+([A-ZÄÖÜ][a-zäöüß]+(?:\s+[a-zäöüß]+)?)/;
    const plzMatch = text.match(plzPattern);
    if (plzMatch && plzMatch[1]) {
        return plzMatch[1].trim();
    }

    return undefined;
}

/**
 * Detects preferred contact method
 */
function detectContactMethod(text: string): 'email' | 'phone' | undefined {
    const lowerText = text.toLowerCase();

    const emailPreference = [
        'per email', 'per e-mail', 'via email', 'email bevorzugt',
        'schreiben sie mir', 'mail'
    ];

    const phonePreference = [
        'per telefon', 'telefonisch', 'anrufen', 'rufen sie mich an',
        'telefon bevorzugt', 'anruf'
    ];

    for (const pref of phonePreference) {
        if (lowerText.includes(pref)) {
            return 'phone';
        }
    }

    for (const pref of emailPreference) {
        if (lowerText.includes(pref)) {
            return 'email';
        }
    }

    // If email was provided but no phone, prefer email
    if (extractEmail(text) && !extractPhoneNumber(text)) {
        return 'email';
    }

    return undefined;
}

/**
 * Validates extracted person data has minimum required fields
 */
export function isPersonDataComplete(data: ExtractedPersonData): boolean {
    return !!(data.full_name && data.email);
}
