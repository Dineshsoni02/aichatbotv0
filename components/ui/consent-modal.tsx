'use client';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';

interface ConsentModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    conversationId: string;
    onSuccess?: () => void;
}

interface PersonFormData {
    full_name: string;
    email: string;
    phone_number: string;
    client_type: 'private' | 'company';
    company_name: string;
    location: string;
    preferred_contact_method: 'email' | 'phone';
}

export function ConsentModal({
    open,
    onOpenChange,
    conversationId,
    onSuccess,
}: ConsentModalProps) {
    const [step, setStep] = useState<'form' | 'consent' | 'success' | 'error'>('form');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formData, setFormData] = useState<PersonFormData>({
        full_name: '',
        email: '',
        phone_number: '',
        client_type: 'private',
        company_name: '',
        location: '',
        preferred_contact_method: 'email',
    });

    const handleInputChange = (field: keyof PersonFormData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmitForm = () => {
        if (!formData.full_name || !formData.email) {
            setError('Name und E-Mail sind erforderlich');
            return;
        }
        setError(null);
        setStep('consent');
    };

    const handleConsent = async (consent: boolean) => {
        if (!consent) {
            onOpenChange(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/person', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationId,
                    ...formData,
                    consent_to_contact: true,
                    consent_share_with_lawyer: true,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Fehler beim Speichern');
            }

            setStep('success');
            onSuccess?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
            setStep('error');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setStep('form');
        setError(null);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md">
                {step === 'form' && (
                    <>
                        <DialogHeader>
                            <DialogTitle>Ihre Kontaktdaten</DialogTitle>
                            <DialogDescription>
                                Bitte geben Sie Ihre Daten ein, damit wir Ihren Fall an eine:n
                                Anwält:in weiterleiten können.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Vollständiger Name *</label>
                                <Input
                                    placeholder="Max Mustermann"
                                    value={formData.full_name}
                                    onChange={(e) => handleInputChange('full_name', e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">E-Mail-Adresse *</label>
                                <Input
                                    type="email"
                                    placeholder="max@beispiel.de"
                                    value={formData.email}
                                    onChange={(e) => handleInputChange('email', e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Telefon (optional)</label>
                                <Input
                                    type="tel"
                                    placeholder="+49 123 456789"
                                    value={formData.phone_number}
                                    onChange={(e) => handleInputChange('phone_number', e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Mandantentyp</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            name="client_type"
                                            checked={formData.client_type === 'private'}
                                            onChange={() => handleInputChange('client_type', 'private')}
                                            className="w-4 h-4"
                                        />
                                        <span>Privatperson</span>
                                    </label>
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            name="client_type"
                                            checked={formData.client_type === 'company'}
                                            onChange={() => handleInputChange('client_type', 'company')}
                                            className="w-4 h-4"
                                        />
                                        <span>Unternehmen</span>
                                    </label>
                                </div>
                            </div>
                            {formData.client_type === 'company' && (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Firmenname</label>
                                    <Input
                                        placeholder="Musterfirma GmbH"
                                        value={formData.company_name}
                                        onChange={(e) => handleInputChange('company_name', e.target.value)}
                                    />
                                </div>
                            )}
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Standort (optional)</label>
                                <Input
                                    placeholder="Berlin"
                                    value={formData.location}
                                    onChange={(e) => handleInputChange('location', e.target.value)}
                                />
                            </div>
                            {error && (
                                <p className="text-sm text-red-600">{error}</p>
                            )}
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={handleClose}>
                                Abbrechen
                            </Button>
                            <Button onClick={handleSubmitForm}>
                                Weiter
                            </Button>
                        </DialogFooter>
                    </>
                )}

                {step === 'consent' && (
                    <>
                        <DialogHeader>
                            <DialogTitle>Einwilligung erforderlich</DialogTitle>
                            <DialogDescription>
                                Bitte bestätigen Sie, dass Ihre Daten gespeichert und an eine:n
                                Anwält:in weitergegeben werden dürfen.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-6">
                            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-4 text-sm">
                                <p className="font-medium mb-2">
                                    Darf ich Ihre Daten speichern und an eine:n Anwält:in weitergeben?
                                </p>
                                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                                    <li>Ihre Kontaktdaten werden sicher gespeichert</li>
                                    <li>Ihr Fall wird an geeignete Anwälte weitergeleitet</li>
                                    <li>Sie werden in Kürze kontaktiert</li>
                                </ul>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => handleConsent(false)}
                                disabled={loading}
                            >
                                Nein, abbrechen
                            </Button>
                            <Button
                                onClick={() => handleConsent(true)}
                                disabled={loading}
                            >
                                {loading ? 'Speichern...' : 'Ja, zustimmen & speichern'}
                            </Button>
                        </DialogFooter>
                    </>
                )}

                {step === 'success' && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <CheckCircle2 className="w-5 h-5 text-green-600" />
                                Erfolgreich gespeichert
                            </DialogTitle>
                        </DialogHeader>
                        <div className="py-6 text-center">
                            <p>
                                Vielen Dank! Ihre Daten wurden sicher gespeichert.
                                <br />
                                Ein:e Anwält:in wird sich in Kürze bei Ihnen melden.
                            </p>
                        </div>
                        <DialogFooter>
                            <Button onClick={handleClose}>Schließen</Button>
                        </DialogFooter>
                    </>
                )}

                {step === 'error' && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <AlertCircle className="w-5 h-5 text-red-600" />
                                Fehler
                            </DialogTitle>
                        </DialogHeader>
                        <div className="py-6 text-center">
                            <p className="text-red-600">{error}</p>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setStep('form')}>
                                Zurück
                            </Button>
                            <Button onClick={handleClose}>Schließen</Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
