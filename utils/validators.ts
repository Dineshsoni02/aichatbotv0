// Validation utilities for Legal Intake Assistant

/**
 * Validates an email address format
 */
export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validates a date string (ISO format or German DD.MM.YYYY)
 */
export function isValidDate(dateString: string): boolean {
    // Try ISO format first
    const isoDate = new Date(dateString);
    if (!isNaN(isoDate.getTime())) {
        return true;
    }

    // Try German date format DD.MM.YYYY
    const germanDateRegex = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
    const match = dateString.match(germanDateRegex);
    if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10);
        const year = parseInt(match[3], 10);
        const date = new Date(year, month - 1, day);
        return (
            date.getDate() === day &&
            date.getMonth() === month - 1 &&
            date.getFullYear() === year
        );
    }

    return false;
}

/**
 * Parses German date format to ISO string
 */
export function parseGermanDate(dateString: string): string | null {
    const germanDateRegex = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
    const match = dateString.match(germanDateRegex);
    if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10);
        const year = parseInt(match[3], 10);
        const date = new Date(year, month - 1, day);
        return date.toISOString().split('T')[0];
    }

    // Try ISO format
    const isoDate = new Date(dateString);
    if (!isNaN(isoDate.getTime())) {
        return isoDate.toISOString().split('T')[0];
    }

    return null;
}

/**
 * Validates urgency level
 */
export type UrgencyLevel = 'low' | 'medium' | 'high';

export function isValidUrgencyLevel(level: string): level is UrgencyLevel {
    return ['low', 'medium', 'high'].includes(level);
}

/**
 * Validates client type
 */
export type ClientType = 'private' | 'company';

export function isValidClientType(type: string): type is ClientType {
    return ['private', 'company'].includes(type);
}

/**
 * Validates contact method
 */
export type ContactMethod = 'email' | 'phone';

export function isValidContactMethod(method: string): method is ContactMethod {
    return ['email', 'phone'].includes(method);
}

/**
 * Validates person data for intake
 */
export interface PersonData {
    full_name: string;
    email: string;
    phone_number?: string;
    client_type: ClientType;
    company_name?: string;
    location?: string;
    preferred_contact_method?: ContactMethod;
    consent_to_contact: boolean;
    consent_share_with_lawyer: boolean;
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

export function validatePersonData(data: Partial<PersonData>): ValidationResult {
    const errors: string[] = [];

    if (!data.full_name || data.full_name.trim().length < 2) {
        errors.push('Name muss mindestens 2 Zeichen haben');
    }

    if (!data.email || !isValidEmail(data.email)) {
        errors.push('Gültige E-Mail-Adresse erforderlich');
    }

    if (!data.client_type || !isValidClientType(data.client_type)) {
        errors.push('Mandantentyp muss "private" oder "company" sein');
    }

    if (data.client_type === 'company' && (!data.company_name || data.company_name.trim().length < 2)) {
        errors.push('Firmenname erforderlich für Firmenmandanten');
    }

    if (data.preferred_contact_method && !isValidContactMethod(data.preferred_contact_method)) {
        errors.push('Kontaktmethode muss "email" oder "phone" sein');
    }

    if (typeof data.consent_share_with_lawyer !== 'boolean') {
        errors.push('Zustimmung zur Weitergabe an Anwalt erforderlich');
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Validates case data
 */
export interface CaseData {
    conversationId: string;
    caseTypeKey?: string;
    title?: string;
    descriptionRaw?: string;
    descriptionStructured?: Record<string, unknown>;
    desiredOutcome?: string;
    estimatedValue?: number;
    deadlineDate?: string;
    urgencyLevel?: UrgencyLevel;
    readyForBidding?: boolean;
}

export function validateCaseData(data: Partial<CaseData>): ValidationResult {
    const errors: string[] = [];

    if (!data.conversationId) {
        errors.push('Conversation ID erforderlich');
    }

    if (data.urgencyLevel && !isValidUrgencyLevel(data.urgencyLevel)) {
        errors.push('Dringlichkeit muss "low", "medium" oder "high" sein');
    }

    if (data.deadlineDate && !isValidDate(data.deadlineDate)) {
        errors.push('Ungültiges Datumsformat');
    }

    if (data.estimatedValue !== undefined && (typeof data.estimatedValue !== 'number' || data.estimatedValue < 0)) {
        errors.push('Streitwert muss eine positive Zahl sein');
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}
