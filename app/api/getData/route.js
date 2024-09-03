import { NextResponse } from 'next/server'
import { Pinecone } from '@pinecone-database/pinecone'

export async function GET() {
  try {
    const pc = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    })
    const index = pc.index('scrape')

    // Fetch all vectors (adjust limit as needed)
    const queryResponse = await index.query({
      topK: 100,
      includeMetadata: true,
      vector: Array(1536).fill(0), // Assuming 1536-dimensional vectors
    })

    return NextResponse.json(queryResponse.matches)
  } catch (error) {
    console.error('Error fetching data:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
