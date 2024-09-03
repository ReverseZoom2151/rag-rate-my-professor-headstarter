import { NextResponse } from 'next/server'
import { Pinecone } from '@pinecone-database/pinecone'
import OpenAI from 'openai'
import axios from 'axios'
import * as cheerio from 'cheerio'

export async function POST(req) {
  try {
    const { url } = await req.json()

    // Scrape the professor's page
    const { data } = await axios.get(url)
    const $ = cheerio.load(data)

    // Extract relevant information (adjust selectors as needed)
    const name = $('.NameTitle__Name-sc-14s4vy8-0').text().trim()
    const department = $('.NameTitle__Title-sc-14s4vy8-1').text().trim()
    const overallRating = $('.RatingValue__Numerator-qw8sqy-2').text().trim()
    const reviews = $('.Comments__StyledComments-dzzyvm-0 .Comment__StyledComment-sc-1wt6g4d-0')
      .map((_, el) => ({
        text: $(el).find('.Comments__StyledComments-dzzyvm-0').text().trim(),
        rating: $(el).find('.CardNumRating__CardNumRatingNumber-sc-17t4b9u-2').text().trim(),
      }))
      .get()

    // Initialize Pinecone and OpenAI
    const pc = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    })
    const index = pc.index('scrape') // Changed from 'rag' to 'scrape'
    const openai = new OpenAI()

    // Create embeddings and insert data for each review
    for (const review of reviews) {
      const embedding = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: review.text,
        encoding_format: 'float',
      })

      await index.upsert([{
        id: `${name}-${Date.now()}`,
        values: embedding.data[0].embedding,
        metadata: {
          name,
          department,
          overallRating,
          review: review.text,
          stars: review.rating,
        },
      }])
    }

    return NextResponse.json({ success: true, message: 'Data scraped and stored successfully' })
  } catch (error) {
    console.error('Error in POST /api/scrape:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
