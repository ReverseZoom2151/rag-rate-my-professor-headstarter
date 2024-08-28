import { NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

async function extractProfessorDetails(text) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const prompt = `
    Extract all relevant information about the professor from the text in JSON format. Include any details that might be useful for students to know, such as their name, subject, department, education, research interests, awards, and any notable achievements or experiences.

    Text:
    ${text}
  `;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
  });

  const aiContent = response.choices[0].message.content;
  console.log("AI Response:", aiContent);
  let extractedInfo;

  try {
    extractedInfo = JSON.parse(aiContent);
  } catch (error) {
    console.error('Failed to parse AI response as JSON:', aiContent);
    try {
      extractedInfo = JSON.parse(aiContent.replace(/```json\n(.*)\n```/, '$1'));
    } catch (error) {
      console.error('Failed to parse AI response as JSON with regex:', aiContent);
      try {
        extractedInfo = JSON.parse(aiContent.replace(/```\n(.*)\n```/, '$1'));
      } catch (error) {
        console.error('Failed to parse AI response as JSON with regex without json label:', aiContent);
        throw new Error('Invalid JSON format in AI response');
      }
    }
  }

  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    encoding_format: 'float',
  });

  const embedding = embeddingResponse.data[0].embedding;

  return {
    extractedInfo,
    embedding,
  };
}

export async function POST(req) {
  const { link, links } = await req.json();
  let allLinks = [];

  if (link) {
    allLinks.push(link);
  }

  if (links && Array.isArray(links)) {
    allLinks = allLinks.concat(links);
  }

  const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
  });

  const index = pc.index('scrape').namespace('ns1');
  const openai = new OpenAI();
  const processedData = [];

  try {
    for (const link of allLinks) {
      console.log(`Processing link: ${link}`);

      const response = await axios.get(link);
      const $ = cheerio.load(response.data);
      const pageTextContent = $('body').text();
      const { extractedInfo, embedding } = await extractProfessorDetails(pageTextContent);

      processedData.push({
        values: embedding,
        id: extractedInfo.professorName,
        metadata: extractedInfo,
      });
    }

    if (processedData.length > 0) {
      const upsertResponse = await index.upsert({
        vectors: processedData,
        namespace: 'ns1',
      });
      return NextResponse.json({
        success: true,
        message: 'Data scraped and inserted into Pinecone',
        upsertedCount: upsertResponse.upserted_count,
      });
    } else {
      return NextResponse.json({
        success: true,
        message: 'No data to insert into Pinecone',
        upsertedCount: 0,
      });
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({
      success: false,
      message: 'Failed to scrape the data',
      error: error.message,
    });
  }
}


