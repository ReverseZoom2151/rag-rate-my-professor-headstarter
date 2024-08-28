import { NextResponse } from 'next/server'
import { Pinecone } from '@pinecone-database/pinecone'
import OpenAI from 'openai'

const systemPrompt = `
You are a rate my professor agent to help students find classes, that takes in user questions and answers them.
For every user question, the top 3 professors that match the user question are returned.
Use them to answer the question if needed.
`

export async function POST(req) {
  const { messages, link } = await req.json()

  const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
  })
  const ragIndex = pc.index('rag').namespace('ns1')
  const scrapeIndex = pc.index('scrape').namespace('ns1')
  const openai = new OpenAI()

  const text = messages[messages.length - 1].content
  const embedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    encoding_format: 'float',
  })

  const ragResults = await ragIndex.query({
    topK: 5,
    includeMetadata: true,
    vector: embedding.data[0].embedding,
  })

  const scrapeResults = await scrapeIndex.query({
    topK: 5,
    includeMetadata: true,
    vector: embedding.data[0].embedding,
    filter: {
      id: {
        $eq: link ? new URL(link).pathname.split('/').pop() : undefined,
      },
    },
  })

  let resultString = ''

  resultString += 'Results from RAG index:\n'
  ragResults.matches.forEach((match) => {
    resultString += `
    Professor: ${match.id}
    Review: ${match.metadata.review}
    Subject: ${match.metadata.subject}
    Stars: ${match.metadata.stars}
    \n\n`
  })

  resultString += 'Results from Scrape index:\n'
  scrapeResults.matches.forEach((match) => {
    resultString += `
    Professor: ${match.id}
    Review: ${match.metadata.review}
    Subject: ${match.metadata.subject}
    \n\n`
  })

  const lastMessage = messages[messages.length - 1]
  const lastMessageContent = lastMessage.content + resultString
  const lastDataWithoutLastMessage = messages.slice(0, messages.length - 1)

  const completion = await openai.chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
      ...lastDataWithoutLastMessage,
      { role: 'user', content: lastMessageContent },
    ],
    model: 'gpt-4',
    stream: true,
  })

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      try {
        for await (const chunk of completion) {
          const content = chunk.choices[0]?.delta?.content
          if (content) {
            const text = encoder.encode(content)
            controller.enqueue(text)
          }
        }
      } catch (err) {
        controller.error(err)
      } finally {
        controller.close()
      }
    },
  })

  return new NextResponse(stream)
}

