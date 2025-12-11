# Legal Intake Assistant (Rechtsfall-Assistent)

A German AI-powered legal intake assistant built with Next.js 14, Vercel AI SDK, and Supabase. This application helps users structure their legal cases through an interactive chat interface with file upload support.

## Features

- 🇩🇪 **German UI** - Full German language support
- 💬 **AI Chat** - Streaming AI responses using Vercel AI SDK
- 📎 **File Upload** - Support for PDF, images, and documents
- 📋 **7-Phase Intake Flow** - Structured case intake process
- ✅ **Consent Management** - GDPR-compliant consent flows
- 📊 **Case Extraction** - Automatic extraction of legal case data
- 🔒 **Privacy First** - No legal advice, explicit consent required

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **AI**: Vercel AI SDK with OpenAI
- **Database**: Supabase (PostgreSQL)
- **UI Components**: Radix UI

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- Supabase account with project set up
- OpenAI API key

### Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Server-only Supabase key (never expose to client)
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# OpenAI API Key (for AI responses)
OPENAI_API_KEY=your_openai_api_key

# Optional: Vercel AI SDK key
# VERCEL_AI_KEY=your_vercel_ai_key

# App Configuration
NEXT_PUBLIC_APP_NAME=Legal Intake Assistant
```

### Database Setup

Ensure your Supabase database has the following tables:

- `conversations` - Stores chat sessions
- `messages` - Stores chat messages
- `documents` - Stores uploaded file metadata
- `persons` - Stores user contact information (after consent)
- `cases` - Stores generated case files

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── chat/route.ts      # Chat API with intake logic
│   │   ├── person/route.ts    # Person data API
│   │   └── case/route.ts      # Case creation API
│   ├── page.tsx               # Main chat interface
│   └── layout.tsx
├── components/
│   ├── ai-elements/           # Chat UI components
│   │   ├── document-badge.tsx
│   │   └── legal-info-card.tsx
│   └── ui/
│       └── consent-modal.tsx  # Consent flow modal
├── lib/
│   ├── supabase-server.ts     # Server Supabase client
│   ├── supabase-client.ts     # Browser Supabase client
│   └── utils.ts
└── utils/
    ├── intakeLogic.ts         # 7-phase intake flow
    ├── caseExtractor.ts       # Case data extraction
    └── validators.ts          # Data validation
```

## Intake Flow (7 Phases)

1. **FREE_TEXT** - User describes their legal issue freely
2. **AUTOMATIC_EXTRACTION** - AI extracts structured data
3. **TARGETED_QUESTIONS** - Max 1-2 clarifying questions
4. **DEADLINES_URGENCY** - Ask about time-sensitive matters
5. **CASE_FILE_GENERATION** - Generate case summary
6. **PERSON_DATA** - Collect contact info (if requested)
7. **CONSENT** - Explicit consent before storing data

## API Endpoints

### POST /api/chat

Main chat endpoint with file upload support.

```typescript
{
  messages: UIMessage[],
  model: string,
  webSearch: boolean,
  conversationId?: string,
  files?: Array<{
    fileName: string,
    fileUrl: string,
    mimeType?: string,
    sizeBytes?: number
  }>
}
```

### POST /api/person

Store person data after consent.

```typescript
{
  conversationId: string,
  full_name: string,
  email: string,
  client_type: 'private' | 'company',
  consent_share_with_lawyer: boolean,
  // ...optional fields
}
```

### POST /api/case

Create case record from intake.

```typescript
{
  conversationId: string,
  title?: string,
  urgencyLevel?: 'low' | 'medium' | 'high',
  deadlineDate?: string,
  // ...optional fields
}
```

## Deployment

### Vercel

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

### Self-hosted

1. Build: `npm run build`
2. Set environment variables
3. Start: `npm start`

## Document Extraction

The system supports file uploads but text extraction requires additional setup:

- **PDF**: Use `pdf-parse` library
- **DOCX**: Use `mammoth` library
- **Images (OCR)**: Integrate Tesseract, Google Cloud Vision, or AWS Textract

## Legal Notice

⚠️ **This system does NOT provide legal advice.** It is designed only for case intake and data collection. All users are directed to consult with a licensed attorney for legal guidance.

## License

MIT
