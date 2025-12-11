'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Scale,
    Users,
    Calendar,
    FileText,
    AlertTriangle,
    Target,
    Clock,
} from 'lucide-react';

interface LegalInfoCardProps {
    data: {
        rechtsgebiet?: string;
        parteien?: {
            klaeger?: string;
            beklagter?: string;
            weitere?: string[];
        };
        vertragsart?: string;
        problemdefinition?: string;
        ziele?: string;
        dringlichkeit?: 'low' | 'medium' | 'high';
        deadlines?: Array<{
            datum: string;
            beschreibung: string;
            kritisch?: boolean;
        }>;
        dokumente?: Array<{
            name: string;
            beschreibung?: string;
        }>;
        streitwert?: {
            betrag?: number;
            waehrung?: string;
        };
    };
    title?: string;
    compact?: boolean;
}

export function LegalInfoCard({
    data,
    title = 'Fallzusammenfassung',
    compact = false,
}: LegalInfoCardProps) {
    const urgencyMap = {
        low: { label: 'Niedrig', color: 'bg-green-100 text-green-800' },
        medium: { label: 'Mittel', color: 'bg-yellow-100 text-yellow-800' },
        high: { label: 'Hoch', color: 'bg-red-100 text-red-800' },
    };

    if (compact) {
        return (
            <div className="flex flex-wrap gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm">
                {data.rechtsgebiet && (
                    <Badge variant="secondary">
                        <Scale className="w-3 h-3 mr-1" />
                        {data.rechtsgebiet}
                    </Badge>
                )}
                {data.dringlichkeit && (
                    <Badge className={urgencyMap[data.dringlichkeit].color}>
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        {urgencyMap[data.dringlichkeit].label}
                    </Badge>
                )}
                {data.deadlines && data.deadlines.length > 0 && (
                    <Badge variant="outline">
                        <Clock className="w-3 h-3 mr-1" />
                        {data.deadlines.length} Frist(en)
                    </Badge>
                )}
            </div>
        );
    }

    return (
        <Card className="border-blue-200 dark:border-blue-800">
            <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                    <Scale className="w-5 h-5 text-blue-600" />
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Rechtsgebiet */}
                {data.rechtsgebiet && (
                    <div className="flex items-start gap-3">
                        <Scale className="w-4 h-4 text-muted-foreground mt-1" />
                        <div>
                            <p className="text-xs text-muted-foreground">Rechtsgebiet</p>
                            <p className="font-medium">{data.rechtsgebiet}</p>
                        </div>
                    </div>
                )}

                {/* Parteien */}
                {data.parteien && (data.parteien.klaeger || data.parteien.beklagter) && (
                    <div className="flex items-start gap-3">
                        <Users className="w-4 h-4 text-muted-foreground mt-1" />
                        <div>
                            <p className="text-xs text-muted-foreground">Parteien</p>
                            <div className="space-y-1">
                                {data.parteien.klaeger && (
                                    <p><span className="text-muted-foreground">Mandant:</span> {data.parteien.klaeger}</p>
                                )}
                                {data.parteien.beklagter && (
                                    <p><span className="text-muted-foreground">Gegenseite:</span> {data.parteien.beklagter}</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Problemdefinition */}
                {data.problemdefinition && (
                    <div className="flex items-start gap-3">
                        <Target className="w-4 h-4 text-muted-foreground mt-1" />
                        <div>
                            <p className="text-xs text-muted-foreground">Sachverhalt</p>
                            <p className="text-sm">{data.problemdefinition.substring(0, 200)}...</p>
                        </div>
                    </div>
                )}

                {/* Dringlichkeit */}
                {data.dringlichkeit && (
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-4 h-4 text-muted-foreground mt-1" />
                        <div>
                            <p className="text-xs text-muted-foreground">Dringlichkeit</p>
                            <Badge className={urgencyMap[data.dringlichkeit].color}>
                                {urgencyMap[data.dringlichkeit].label}
                            </Badge>
                        </div>
                    </div>
                )}

                {/* Fristen */}
                {data.deadlines && data.deadlines.length > 0 && (
                    <div className="flex items-start gap-3">
                        <Calendar className="w-4 h-4 text-muted-foreground mt-1" />
                        <div>
                            <p className="text-xs text-muted-foreground">Fristen</p>
                            <ul className="space-y-1">
                                {data.deadlines.map((d, i) => (
                                    <li key={i} className="text-sm flex items-center gap-2">
                                        <span className="font-medium">{d.datum}</span>
                                        <span className="text-muted-foreground">{d.beschreibung}</span>
                                        {d.kritisch && (
                                            <Badge variant="destructive" className="text-xs">⚠️ Kritisch</Badge>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}

                {/* Dokumente */}
                {data.dokumente && data.dokumente.length > 0 && (
                    <div className="flex items-start gap-3">
                        <FileText className="w-4 h-4 text-muted-foreground mt-1" />
                        <div>
                            <p className="text-xs text-muted-foreground">Dokumente</p>
                            <ul className="space-y-1">
                                {data.dokumente.map((d, i) => (
                                    <li key={i} className="text-sm">
                                        📄 {d.name}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}

                {/* Streitwert */}
                {data.streitwert?.betrag && (
                    <div className="flex items-start gap-3">
                        <span className="text-muted-foreground mt-1">💰</span>
                        <div>
                            <p className="text-xs text-muted-foreground">Streitwert</p>
                            <p className="font-medium">
                                {data.streitwert.betrag.toLocaleString('de-DE')} {data.streitwert.waehrung || '€'}
                            </p>
                        </div>
                    </div>
                )}

                {/* Disclaimer */}
                <div className="pt-3 mt-3 border-t">
                    <p className="text-xs text-muted-foreground italic">
                        Hinweis: Dies ist keine Rechtsberatung. Für rechtliche Schritte wenden
                        Sie sich bitte an einen zugelassenen Anwalt.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
