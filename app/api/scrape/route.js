import { NextResponse } from 'next/server'
import axios from 'axios'
import * as cheerio from 'cheerio'
import { Pinecone } from '@pinecone-database/pinecone'
import OpenAI from 'openai'

export async function POST(req) {
  const { link } = await req.json()

  try {
    const response = await axios.get(link)
    const $ = cheerio.load(response.data)

    const professorName = $('.NameTitle__Name-dowf0z-2.cJdVEK').text().trim()
    const subject = $('.CardSchool__Department-sc-19lmz2k-4.kqnHjq').text().trim()
    const reviews = []

    $('.RatingValues__RatingValue-sc-6dc747-2.kMhQjf').each((index, element) => {
      const review = $(element).text().trim()
      reviews.push(review)
    })

    const pc = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    })
    const index = pc.index('scrape').namespace('ns1')
    const openai = new OpenAI()

    const processedData = []

    for (const review of reviews) {
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: review,
        encoding_format: 'float',
      })

      const embedding = embeddingResponse.data[0].embedding

      processedData.push({
        values: embedding,
        id: professorName,
        metadata: {
          review,
          subject,
        },
      })
    }

    const upsertResponse = await index.upsert({
      vectors: processedData,
      namespace: 'ns1',
    })

    return NextResponse.json({
      success: true,
      message: 'Data scraped and inserted into Pinecone',
      upsertedCount: upsertResponse.upserted_count,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({
      success: false,
      message: 'Failed to scrape the data',
      error: error.message,
    })
  }
}

