# ShowBuilder

An AI-powered slide builder for ProPresenter. Paste or upload a style guide and your presentation notes, and ShowBuilder uses OpenAI to generate a ready-to-import `.pro6` file in seconds.

![ShowBuilder UI](https://github.com/user-attachments/assets/1335a538-2600-454e-8b15-669eb8c5f54d)

## Features

- **AI-generated slides** using OpenAI GPT-4o-mini
- **Style guide support** — type instructions or upload a `.txt`/`.md`/`.json` file
- **Slide preview** with toggleable presenter notes
- **One-click download** of a ProPresenter 6 (`.pro6`) file importable into ProPresenter 6 or 7

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- An [OpenAI API key](https://platform.openai.com/api-keys)

### Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env.local` file from the example:
   ```bash
   cp .env.example .env.local
   ```

3. Add your OpenAI API key to `.env.local`:
   ```
   OPENAI_API_KEY=sk-...
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. Enter a **Presentation Title**.
2. Optionally provide a **Style Guide** describing the look and tone of your slides (or upload a `.txt`/`.md`/`.json` file).
3. Paste your **Presentation Notes / Content** — topics, scripture references, bullet points, or a full outline.
4. Click **Generate Slides**. The AI will create a structured slide deck and show a preview.
5. Click **Download .pro6 File** to save the file, then import it into ProPresenter via *File → Import*.

## Tech Stack

- [Next.js 16](https://nextjs.org/) – React framework with App Router
- [Tailwind CSS v4](https://tailwindcss.com/) – utility-first styling
- [OpenAI Node SDK](https://github.com/openai/openai-node) – GPT-4o-mini via JSON mode

## Deploy on Vercel

The easiest way to deploy this app is with [Vercel](https://vercel.com/new). Add your `OPENAI_API_KEY` as an environment variable in the Vercel dashboard.

