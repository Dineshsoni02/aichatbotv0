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
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import { Fragment, useState, useEffect, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { CopyIcon, GlobeIcon, RefreshCcwIcon, Scale, FileText } from 'lucide-react';
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@/components/ai-elements/sources';
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
  {
    name: 'Deepseek R1',
    value: 'deepseek/deepseek-r1',
  },
];

// German UI strings
const UI_STRINGS = {
  title: 'Rechtsfall-Assistent',
  subtitle: 'KI-gestützte Fallaufnahme für Ihre Rechtsangelegenheit',
  placeholder: 'Beschreiben Sie Ihren Fall...',
  searchButton: 'Suche',
  copyLabel: 'Kopieren',
  retryLabel: 'Erneut versuchen',
  uploadToast: 'Datei hochgeladen — wird dem Gespräch hinzugefügt',
  welcomeMessage: 'Wir helfen Ihnen, Ihr Rechtsanliegen schnell und strukturiert aufzubereiten und alle wichtigen Informationen zu sammeln. Anschließend verbinden wir Sie mit einem passenden, spezialisierten Rechtsanwalt zu einem transparenten Fixpreis.\n\nSo reduzieren Sie Aufwand und Kosten, weil der Anwalt direkt mit einer vollständig vorbereiteten Fallübersicht starten kann.\n\nBitte beschreiben Sie Ihr Anliegen so genau wie möglich. Ich stelle Ihnen danach gezielte Fragen, um alles optimal für den Anwalt vorzubereiten.',
  disclaimer: 'Hinweis: Dies ist keine Rechtsberatung. Alle Informationen dienen nur der Fallaufnahme.',
};

interface UploadedDoc {
  id: string;
  fileName: string;
  status: 'uploading' | 'complete' | 'error';
}

const LegalIntakeAssistant = () => {
  const [input, setInput] = useState('');
  const [model, setModel] = useState<string>(models[0].value);
  const [webSearch, setWebSearch] = useState(false);
  // Use useRef to persist conversation ID across renders without causing re-renders
  const conversationIdRef = useRef<string | null>(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);

  const { messages, sendMessage, status, regenerate } = useChat();

  // Handle file upload notification
  const handleFileUpload = (files: File[]) => {
    files.forEach(file => {
      toast.success(`${file.name} — ${UI_STRINGS.uploadToast}`);
      setUploadedDocs(prev => [...prev, {
        id: crypto.randomUUID(),
        fileName: file.name,
        status: 'complete',
      }]);
    });
  };

  const handleSubmit = (message: PromptInputMessage) => {
    const hasText = Boolean(message.text);
    const hasAttachments = Boolean(message.files?.length);
    if (!(hasText || hasAttachments)) {
      return;
    }

    // Notify about file uploads
    if (message.files?.length) {
      // Show toast for each attachment
      message.files.forEach(file => {
        const fileName = 'name' in file ? file.name : 'Dokument';
        toast.success(`${fileName} — ${UI_STRINGS.uploadToast}`);
      });
    }

    // Generate conversation ID on first message if not exists
    if (!conversationIdRef.current) {
      conversationIdRef.current = crypto.randomUUID();
      console.log('Created new conversation:', conversationIdRef.current);
    }

    sendMessage(
      {
        text: message.text || 'Dokument hochgeladen',
        files: message.files
      },
      {
        body: {
          model: model,
          webSearch: webSearch,
          conversationId: conversationIdRef.current,
        },
      },
    );
    setInput('');
  };

  // Detect consent request in assistant messages
  useEffect(() => {
    const lastAssistantMessage = messages
      .filter(m => m.role === 'assistant')
      .slice(-1)[0];

    if (lastAssistantMessage) {
      const content = lastAssistantMessage.parts
        ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text')
        .map(part => part.text.toLowerCase())
        .join(' ') || '';

      // Detect consent request patterns
      if (
        content.includes('darf ich ihre daten speichern') ||
        content.includes('einwilligung') ||
        (content.includes('zustimm') && content.includes('anwält'))
      ) {
        // Could trigger consent modal here
        // setShowConsentModal(true);
      }
    }
  }, [messages]);

  return (
    <div className="max-w-4xl mx-auto p-6 relative size-full h-screen">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <div className="mb-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Scale className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold">{UI_STRINGS.title}</h1>
        </div>
        <p className="text-muted-foreground text-sm">{UI_STRINGS.subtitle}</p>
        <p className="text-xs text-muted-foreground mt-1 italic">{UI_STRINGS.disclaimer}</p>
      </div>

      {/* Uploaded documents bar */}
      {uploadedDocs.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 p-3 bg-muted/30 rounded-lg">
          <div className="w-full text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <FileText className="w-3 h-3" />
            Hochgeladene Dokumente:
          </div>
          {uploadedDocs.map((doc) => (
            <DocumentBadge
              key={doc.id}
              fileName={doc.fileName}
              extractionStatus={doc.status === 'complete' ? 'pending' : 'failed'}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col h-[calc(100%-180px)]">
        <Conversation className="h-full">
          <ConversationContent>
            {/* Welcome message if no messages */}
            {messages.length === 0 && (
              <Message from="assistant">
                <MessageContent>
                  <MessageResponse>
                    {UI_STRINGS.welcomeMessage}
                  </MessageResponse>
                </MessageContent>
              </Message>
            )}

            {messages.map((message) => (
              <div key={message.id}>
                {message.role === 'assistant' && message.parts.filter((part) => part.type === 'source-url').length > 0 && (
                  <Sources>
                    <SourcesTrigger
                      count={
                        message.parts.filter(
                          (part) => part.type === 'source-url',
                        ).length
                      }
                    />
                    {message.parts.filter((part) => part.type === 'source-url').map((part, i) => (
                      <SourcesContent key={`${message.id}-${i}`}>
                        <Source
                          key={`${message.id}-${i}`}
                          href={part.url}
                          title={part.url}
                        />
                      </SourcesContent>
                    ))}
                  </Sources>
                )}
                {message.parts.map((part, i) => {
                  switch (part.type) {
                    case 'text':
                      const isStreamingMessage = status === 'streaming' && message.role === 'assistant' && message.id === messages.at(-1)?.id;
                      return (
                        <Message key={`${message.id}-${i}`} from={message.role}>
                          <MessageContent>
                            <MessageResponse
                              isAnimating={isStreamingMessage}
                              mode={isStreamingMessage ? 'streaming' : 'static'}
                            >
                              {part.text}
                            </MessageResponse>
                          </MessageContent>
                          {message.role === 'assistant' && i === messages.length - 1 && (
                            <MessageActions>
                              <MessageAction
                                onClick={() => regenerate()}
                                label={UI_STRINGS.retryLabel}
                              >
                                <RefreshCcwIcon className="size-3" />
                              </MessageAction>
                              <MessageAction
                                onClick={() =>
                                  navigator.clipboard.writeText(part.text)
                                }
                                label={UI_STRINGS.copyLabel}
                              >
                                <CopyIcon className="size-3" />
                              </MessageAction>
                            </MessageActions>
                          )}
                        </Message>
                      );
                    case 'reasoning':
                      return (
                        <Reasoning
                          key={`${message.id}-${i}`}
                          className="w-full"
                          isStreaming={status === 'streaming' && i === message.parts.length - 1 && message.id === messages.at(-1)?.id}
                        >
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

        <PromptInput onSubmit={handleSubmit} className="mt-4" globalDrop multiple>
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
                  <PromptInputActionAddAttachments />
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>


            </PromptInputTools>
            <PromptInputSubmit disabled={!input && !status} status={status} />
          </PromptInputFooter>
        </PromptInput>
      </div>

      {/* Consent Modal */}
      <ConsentModal
        open={showConsentModal}
        onOpenChange={setShowConsentModal}
        conversationId={conversationIdRef.current || ''}
        onSuccess={() => {
          toast.success('Ihre Daten wurden erfolgreich gespeichert!');
        }}
      />
    </div>
  );
};

export default LegalIntakeAssistant;