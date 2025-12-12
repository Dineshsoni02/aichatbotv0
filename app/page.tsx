'use client';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from '@/components/ai-elements/message';
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputButton,
  PromptInputHeader,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import { useState, useRef, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import {
  CopyIcon,
  RefreshCcwIcon,
  Scale,
  FileText,
  Home,
  Briefcase,
  Users,
  FileSignature,
  Car,
  Landmark,
  HeartHandshake,
  Shield,
  Building2,
  Stethoscope,
  Monitor,
  Lock,
  Clock,
  CheckCircle,
  ArrowRight,
  MessageSquare,
  ClipboardList,
  FileCheck,
  UserCheck,
  Sparkles,
  Euro,
  ShieldCheck,
  Globe,
} from 'lucide-react';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning';
import { Loader } from '@/components/ai-elements/loader';
import { Toaster, toast } from 'sonner';
import { ConsentModal } from '@/components/ui/consent-modal';
import { DocumentBadge } from '@/components/ai-elements/document-badge';

const models = [
  {
    name: 'GPT 4o',
    value: 'openai/gpt-4o-mini',
  },
];

// German UI strings
const UI_STRINGS = {
  heroTitle: 'KI-gestützte Fallaufnahme',
  heroSubtitle: 'Ihr Rechtsfall, strukturiert erfasst',
  heroDescription: 'Beschreiben Sie Ihren Fall unserem KI-Assistenten. Wir erfassen alle wichtigen Details und verbinden Sie optional mit einem passenden Anwalt.',
  chatTitle: 'Rechtsassistent',
  chatStatus: 'Online – Vertrauliche Fallaufnahme',
  welcomeTitle: 'Willkommen beim Rechtsassistenten',
  welcomeMessage: 'Wir helfen Ihnen, Ihr Rechtsanliegen schnell und strukturiert aufzubereiten und alle wichtigen Informationen zu sammeln. Anschließend verbinden wir Sie mit einem passenden, spezialisierten Rechtsanwalt zu einem transparenten Fixpreis.\n\nSo reduzieren Sie Aufwand und Kosten, weil der Anwalt direkt mit einer vollständig vorbereiteten Fallübersicht starten kann.\n\nBitte beschreiben Sie Ihr Anliegen so genau wie möglich. Ich stelle Ihnen danach gezielte Fragen, um alles optimal für den Anwalt vorzubereiten.',
  quickStartTitle: 'Schnellstart – Wählen Sie ein Thema:',
  placeholder: 'Beschreiben Sie Ihren Rechtsfall...',
  attachButton: 'Bild oder PDF anhängen',
  sendButton: 'Nachricht senden',
  inputHint: 'Ihre Daten werden vertraulich behandelt. Drücken Sie Enter zum Senden oder hängen Sie ein Dokument an.',
  copyLabel: 'Kopieren',
  retryLabel: 'Erneut versuchen',
  disclaimer: 'Hinweis: Dieser Service ersetzt keine anwaltliche Beratung.',
};

// Quick start legal topics
const LEGAL_TOPICS = [
  { name: 'Mietrecht', icon: Home },
  { name: 'Arbeitsrecht', icon: Briefcase },
  { name: 'Familienrecht', icon: Users },
  { name: 'Vertragsrecht', icon: FileSignature },
];

// How it works steps
const STEPS = [
  { number: 1, title: 'Fall beschreiben', description: 'Schildern Sie Ihren Rechtsfall in eigenen Worten – unser KI-Assistent hört zu.', icon: MessageSquare },
  { number: 2, title: 'Details klären', description: 'Beantworten Sie gezielte Rückfragen zu fehlenden Informationen.', icon: ClipboardList },
  { number: 3, title: 'Zusammenfassung prüfen', description: 'Überprüfen Sie die strukturierte Fallzusammenfassung.', icon: FileCheck },
  { number: 4, title: 'Anwalt anfragen', description: 'Optional: Lassen Sie sich mit einem passenden Anwalt verbinden.', icon: UserCheck },
];

// Feature cards
const FEATURES = [
  { title: 'Keine Rechtsberatung', description: 'Wir erfassen nur Ihren Fall, geben aber keine rechtliche Beratung.', icon: Shield },
  { title: 'Schnelle Aufnahme', description: 'Strukturierte Fallerfassung in wenigen Minuten.', icon: Clock },
  { title: 'Datenschutz', description: 'Ihre Daten werden nur mit Ihrer Zustimmung gespeichert.', icon: Lock },
  { title: 'Anwaltsvermittlung', description: 'Optional: Weitergabe an qualifizierte Anwälte.', icon: UserCheck },
];

// Benefits
const BENEFITS = [
  { title: 'Zeit sparen', description: 'Strukturierte Fallaufnahme in wenigen Minuten statt stundenlanger Formulare.', icon: Clock },
  { title: '100% Vertraulich', description: 'Ihre Daten werden nur mit ausdrücklicher Einwilligung gespeichert und weitergegeben.', icon: ShieldCheck },
  { title: 'Kostenlos', description: 'Die Fallaufnahme ist komplett kostenlos und unverbindlich.', icon: Euro },
];

// What we capture
const CAPTURE_ITEMS = [
  'Rechtsgebiet & Sachverhalt',
  'Beteiligte Parteien',
  'Wichtige Fristen & Termine',
  'Streitwert & Ziele',
  'Relevante Dokumente',
];

// All supported legal areas
const LEGAL_AREAS = [
  { name: 'Mietrecht', icon: Home },
  { name: 'Arbeitsrecht', icon: Briefcase },
  { name: 'Familienrecht', icon: Users },
  { name: 'Vertragsrecht', icon: FileSignature },
  { name: 'Verkehrsrecht', icon: Car },
  { name: 'Erbrecht', icon: Landmark },
  { name: 'Sozialrecht', icon: HeartHandshake },
  { name: 'Strafrecht', icon: Shield },
  { name: 'Baurecht', icon: Building2 },
  { name: 'Medizinrecht', icon: Stethoscope },
  { name: 'IT-Recht', icon: Monitor },
  { name: 'Datenschutzrecht', icon: Lock },
];

interface UploadedDoc {
  id: string;
  fileName: string;
  status: 'uploading' | 'complete' | 'error';
}

const LegalIntakeAssistant = () => {
  const [input, setInput] = useState('');
  const [model] = useState<string>(models[0].value);
  const [webSearch] = useState(false);
  const conversationIdRef = useRef<string | null>(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [showChat, setShowChat] = useState(false);

  const { messages, sendMessage, status, regenerate } = useChat();

  const handleSubmit = (message: PromptInputMessage) => {
    const hasText = Boolean(message.text);
    const hasAttachments = Boolean(message.files?.length);
    if (!(hasText || hasAttachments)) return;

    if (message.files?.length) {
      message.files.forEach(file => {
        const fileName = 'name' in file ? file.name : 'Dokument';
        toast.success(`${fileName} — wird dem Gespräch hinzugefügt`);
      });
    }

    if (!conversationIdRef.current) {
      conversationIdRef.current = crypto.randomUUID();
    }

    sendMessage(
      { text: message.text || 'Dokument hochgeladen', files: message.files },
      { body: { model, webSearch, conversationId: conversationIdRef.current } }
    );
    setInput('');
    setShowChat(true);
  };

  const handleQuickStart = (topic: string) => {
    setShowChat(true);
    if (!conversationIdRef.current) {
      conversationIdRef.current = crypto.randomUUID();
    }
    sendMessage(
      { text: `Ich habe eine Frage zum Thema ${topic}.` },
      { body: { model, webSearch, conversationId: conversationIdRef.current } }
    );
  };

  // Auto-show chat when messages exist
  useEffect(() => {
    if (messages.length > 0) setShowChat(true);
  }, [messages]);

  return (
    <div className="min-h-screen legal-gradient">
      <Toaster position="top-center" richColors />

      {/* Hero Section */}
      <section className="relative py-12 px-6">
        <div className="max-w-6xl mx-auto text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 rounded-2xl bg-primary/10 shadow-lg">
              <Scale className="w-10 h-10 text-primary" />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
            {UI_STRINGS.heroTitle}
          </h1>
          <p className="text-xl md:text-2xl text-foreground/80 font-medium mb-3">
            {UI_STRINGS.heroSubtitle}
          </p>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
            {UI_STRINGS.heroDescription}
          </p>
        </div>
      </section>

      {/* Main Chat Section */}
      <section className="px-6 pb-12">
        <div className="max-w-4xl mx-auto">
          {/* Chat Container */}
          <div className="glass-card rounded-3xl overflow-hidden shadow-2xl">
            {/* Chat Header */}
            <div className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl">
                  <Scale className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="font-semibold text-lg">{UI_STRINGS.chatTitle}</h2>
                  <p className="text-sm text-primary-foreground/80 flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                    {UI_STRINGS.chatStatus}
                  </p>
                </div>
              </div>
            </div>

            {/* Chat Body */}
            <div className="flex flex-col" style={{ height: showChat ? '500px' : 'auto' }}>
              <Conversation className="flex-1 overflow-y-scroll chat-container" style={{ scrollbarGutter: 'stable' }}>
                <ConversationContent className="p-6">
                  {/* Welcome message */}
                  {messages.length === 0 && (
                    <Message from="assistant">
                      <MessageContent>
                        <div className="welcome-message">
                          <h3 className="font-semibold text-lg mb-3 text-primary">
                            {UI_STRINGS.welcomeTitle}
                          </h3>
                          <MessageResponse>
                            {UI_STRINGS.welcomeMessage}
                          </MessageResponse>
                        </div>
                      </MessageContent>
                    </Message>
                  )}

                  {/* Messages */}
                  {messages.map((message) => (
                    <div key={message.id}>
                      {message.parts.map((part, i) => {
                        switch (part.type) {
                          case 'text':
                            const isStreaming = status === 'streaming' && message.role === 'assistant' && message.id === messages.at(-1)?.id;
                            return (
                              <Message key={`${message.id}-${i}`} from={message.role}>
                                <MessageContent>
                                  <MessageResponse isAnimating={isStreaming} mode={isStreaming ? 'streaming' : 'static'}>
                                    {part.text}
                                  </MessageResponse>
                                </MessageContent>
                                {message.role === 'assistant' && !isStreaming && (
                                  <MessageActions>
                                    <MessageAction onClick={() => regenerate()} label={UI_STRINGS.retryLabel}>
                                      <RefreshCcwIcon className="size-3" />
                                    </MessageAction>
                                    <MessageAction onClick={() => navigator.clipboard.writeText(part.text)} label={UI_STRINGS.copyLabel}>
                                      <CopyIcon className="size-3" />
                                    </MessageAction>
                                  </MessageActions>
                                )}
                              </Message>
                            );
                          case 'reasoning':
                            return (
                              <Reasoning key={`${message.id}-${i}`} className="w-full" isStreaming={status === 'streaming'}>
                                <ReasoningTrigger />
                                <ReasoningContent>{part.text}</ReasoningContent>
                              </Reasoning>
                            );
                          default:
                            return null;
                        }
                      })}
                    </div>
                  ))}
                  {status === 'submitted' && <Loader />}
                </ConversationContent>
                <ConversationScrollButton />
              </Conversation>

              {/* Quick Start Topics - only show if no messages */}
              {messages.length === 0 && (
                <div className="px-6 py-4 border-t border-border/50">
                  <p className="text-sm text-muted-foreground mb-3 font-medium">{UI_STRINGS.quickStartTitle}</p>
                  <div className="flex flex-wrap gap-2">
                    {LEGAL_TOPICS.map((topic) => (
                      <button
                        key={topic.name}
                        onClick={() => handleQuickStart(topic.name)}
                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-secondary hover:bg-primary hover:text-primary-foreground transition-all text-sm font-medium"
                      >
                        <topic.icon className="w-4 h-4" />
                        {topic.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input Area */}
              <PromptInput onSubmit={handleSubmit} className="border-t border-border/50" globalDrop multiple>
                <PromptInputHeader>
                  <PromptInputAttachments>
                    {(attachment) => <PromptInputAttachment data={attachment} />}
                  </PromptInputAttachments>
                </PromptInputHeader>
                <PromptInputBody>
                  <PromptInputTextarea
                    onChange={(e) => setInput(e.target.value)}
                    value={input}
                    placeholder={UI_STRINGS.placeholder}
                  />
                </PromptInputBody>
                <PromptInputFooter>
                  <PromptInputTools>
                    <PromptInputActionMenu>
                      <PromptInputActionMenuTrigger />
                      <PromptInputActionMenuContent>
                        <PromptInputActionAddAttachments label={UI_STRINGS.attachButton} />
                      </PromptInputActionMenuContent>
                    </PromptInputActionMenu>
                  </PromptInputTools>
                  <PromptInputSubmit disabled={!input && !status} status={status} />
                </PromptInputFooter>
              </PromptInput>

              {/* Input Hint */}
              <p className="text-xs text-muted-foreground/60 text-center py-2 border-t border-border/30">
                {UI_STRINGS.inputHint}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works - Mini */}
      <section className="px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="glass-card rounded-2xl p-6">
            <h3 className="text-lg font-semibold mb-4 text-center">So funktioniert es</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {STEPS.map((step) => (
                <div key={step.number} className="text-center">
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center mx-auto mb-2">
                    {step.number}
                  </div>
                  <p className="text-sm font-medium">{step.title}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Feature Cards */}
      <section className="px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="glass-card rounded-xl p-4 text-center">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <feature.icon className="w-5 h-5 text-primary" />
                </div>
                <h4 className="font-semibold text-sm mb-1">{feature.title}</h4>
                <p className="text-xs text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What We Capture */}
      <section className="px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="glass-card rounded-2xl p-6">
            <h3 className="text-lg font-semibold mb-4">Was wir erfassen</h3>
            <div className="flex flex-wrap gap-3">
              {CAPTURE_ITEMS.map((item) => (
                <span key={item} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-sm">
                  <CheckCircle className="w-4 h-4 text-primary" />
                  {item}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border/50">
              <Globe className="w-4 h-4 text-primary" />
              <span className="text-sm text-muted-foreground">
                <strong>DSGVO-konform</strong> – Ihre Daten werden ausschließlich in der EU verarbeitet
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Detailed Steps Section */}
      <section className="px-6 py-12 bg-secondary/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">So funktioniert es</h2>
            <p className="text-muted-foreground">In vier einfachen Schritten zu Ihrer strukturierten Fallakte</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {STEPS.map((step) => (
              <div key={step.number} className="glass-card rounded-2xl p-6 flex gap-4">
                <div className="shrink-0">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground font-bold text-lg flex items-center justify-center shadow-lg">
                    {step.number}
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-lg mb-1">Schritt {step.number}: {step.title}</h4>
                  <p className="text-muted-foreground text-sm">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="px-6 py-12">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">Ihre Vorteile</h2>
            <p className="text-muted-foreground">Warum Sie Legal Intake für Ihre Rechtsfälle nutzen sollten</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {BENEFITS.map((benefit) => (
              <div key={benefit.title} className="glass-card rounded-2xl p-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <benefit.icon className="w-7 h-7 text-primary-foreground" />
                </div>
                <h4 className="font-semibold text-lg mb-2">{benefit.title}</h4>
                <p className="text-muted-foreground text-sm">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Supported Legal Areas */}
      <section className="px-6 py-12 bg-secondary/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">Unterstützte Rechtsgebiete</h2>
            <p className="text-muted-foreground">Unser KI-Assistent unterstützt Sie bei vielen Rechtsgebieten</p>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {LEGAL_AREAS.map((area) => (
              <div key={area.name} className="glass-card rounded-xl p-4 text-center hover:scale-105 transition-transform cursor-default">
                <area.icon className="w-6 h-6 text-primary mx-auto mb-2" />
                <p className="text-sm font-medium">{area.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Important Notice */}
      <section className="px-6 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="glass-card rounded-2xl p-6 border-l-4 border-primary">
            <h3 className="text-lg font-semibold mb-4">Wichtiger Hinweis</h3>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p><strong className="text-foreground">Keine Rechtsberatung:</strong> Dieser Service bietet keine Rechtsberatung. Alle Informationen dienen ausschließlich der strukturierten Erfassung Ihres Rechtsfalls.</p>
              <p><strong className="text-foreground">Datenschutz:</strong> Ihre Daten werden nur mit Ihrer ausdrücklichen Einwilligung gespeichert und weitergegeben. Sie behalten jederzeit die volle Kontrolle über Ihre Informationen.</p>
              <p><strong className="text-foreground">DSGVO-konform:</strong> Alle Daten werden ausschließlich auf Servern innerhalb der Europäischen Union verarbeitet und gespeichert.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-6 py-16 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">Bereit, Ihren Fall aufzunehmen?</h2>
          <p className="text-primary-foreground/80 mb-8">
            Starten Sie jetzt die kostenlose und unverbindliche Fallaufnahme mit unserem KI-Assistenten.
          </p>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-white text-primary font-semibold text-lg shadow-xl hover:shadow-2xl transition-all hover:scale-105"
          >
            <Sparkles className="w-5 h-5" />
            Jetzt Gespräch starten
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 bg-card border-t border-border">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Scale className="w-5 h-5 text-primary" />
              <span className="font-semibold">Legal Intake Assistant</span>
            </div>
            <nav className="flex items-center gap-6 text-sm text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">Datenschutz</a>
              <a href="#" className="hover:text-foreground transition-colors">Impressum</a>
              <a href="#" className="hover:text-foreground transition-colors">AGB</a>
              <a href="#" className="hover:text-foreground transition-colors">Kontakt</a>
            </nav>
          </div>
          <p className="text-center text-xs text-muted-foreground mt-6">
            © 2025 Legal Intake Assistant. Alle Rechte vorbehalten.
          </p>
        </div>
      </footer>

      {/* Consent Modal */}
      <ConsentModal
        open={showConsentModal}
        onOpenChange={setShowConsentModal}
        conversationId={conversationIdRef.current || ''}
        onSuccess={() => toast.success('Ihre Daten wurden erfolgreich gespeichert!')}
      />
    </div>
  );
};

export default LegalIntakeAssistant;